/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * cmd/cainst/modules/dtrace.js: DTrace Instrumenter backend
 */

var mod_ca = require('../../../lib/ca/ca-common');
var mod_dtrace = require('libdtrace');
var mod_capred = require('../../../lib/ca/ca-pred');
var mod_caagg = require('../../../lib/ca/ca-agg');
var mod_fs = require('fs');
var mod_sys = require('sys');
var mod_cametad = require('../../../lib/ca/ca-metad');
var ASSERT = require('assert');

var insd_log;
var insd_dt_bufsize = '16k';		/* principal buffer size */
var insd_dt_cleanrate = '101hz';	/* cleaning rate */
var insd_dt_dynvarsize = '32M';		/* dynamic variable space */
var insd_dt_strsize = '128';		/* string size */
var insd_dt_libpath = [];		/* DTrace library Path (-L) */
var insd_nenablings = 0;		/* number of active enablings */

if (process.env['DTRACE_LIBPATH'])
	insd_dt_libpath = process.env['DTRACE_LIBPATH'].split(':');

function insdGenerateMetricFunc(desc, metadata)
{
	return (function (metric) {
	    var res = mod_cametad.mdGenerateDScript(desc, metric, metadata);
	    var progs = res['scripts'].map(function (s) {
	        return (new insDTraceVectorMetric(s, res['hasdecomps'],
		    res['zero'], res['hasdists']));
	    });
	    return (new insDTraceMetricArray(progs));
	});
}

exports.insinit = function (ins, log, callback)
{
	insd_log = log;

	ins.registerReporter('dtrace', insdStatus);

	/*
	 * We expect to be invoked from the root of the package, so we specify a
	 * complete relative path to our meta-D directory.  However, when we
	 * "require" these modules below, the path is relative to this source
	 * file.
	 */
	mod_fs.readdir('./cmd/cainst/modules/dtrace', function (err, files) {
		var ii, metric, mod;

		if (err) {
			callback(new caSystemError(err,
			    'failed to list meta-D files'));
			return;
		}

		/*
		 * Sort the files so that we load them in a deterministic order
		 * each time.  This isn't so that we can depend on this but
		 * rather to avoid getting bitten by implicit dependencies.
		 */
		files.sort();

		for (ii = 0; ii < files.length; ii++) {
			metric = require(caSprintf('./dtrace/%s', files[ii]));
			mod = caDeepCopy(metric['cadMetricDesc']);
			mod['impl'] = insdGenerateMetricFunc(
			    metric['cadMetricDesc'], ins.metadata());
			ins.registerMetric(mod);
		}

		callback();
	});
};

function insdStatus()
{
	var ret = {};
	ret['dtrace_libpath'] = insd_dt_libpath;
	ret['dtrace_bufsize'] = insd_dt_bufsize;
	ret['dtrace_cleanrate'] = insd_dt_cleanrate;
	ret['dtrace_dynvarsize'] = insd_dt_dynvarsize;
	ret['dtrace_strsize'] = insd_dt_strsize;
	ret['nenablings'] = insd_nenablings;
	return (ret);
}

function insDTraceMetric(prog)
{
	this.cad_prog = prog;
}


insDTraceMetric.prototype.instrument = function (callback)
{
	var ii;
	var sep = '----------------------------------------';

	/*
	 * Only log the script on the first time through here.
	 */
	if (this.cad_dtr === undefined)
		insd_log.dbg('\n%s\n%s%s', sep, this.cad_prog, sep);

	this.cad_dtr = new mod_dtrace.Consumer();
	this.cad_dtr.setopt('bufsize', insd_dt_bufsize);
	this.cad_dtr.setopt('cleanrate', insd_dt_cleanrate);
	this.cad_dtr.setopt('dynvarsize', insd_dt_dynvarsize);
	this.cad_dtr.setopt('strsize', insd_dt_strsize);
	this.cad_dtr.setopt('zdefs');
	for (ii = 0; ii < insd_dt_libpath.length; ii++)
		this.cad_dtr.setopt('libdir', insd_dt_libpath[ii]);

	try {
		this.cad_dtr.strcompile(this.cad_prog);
		this.cad_dtr.go();
		insd_nenablings++;

		if (callback)
			callback();
	} catch (ex) {
		insd_log.error('instrumentation failed: %r', ex);
		this.cad_dtr = null;
		if (callback)
			callback(ex);
	}
};

insDTraceMetric.prototype.deinstrument = function (callback)
{
	--insd_nenablings;
	this.cad_dtr.stop();
	this.cad_dtr = null;

	if (callback)
		callback();
};

insDTraceMetric.prototype.tick = function ()
{
	if (!this.cad_dtr)
		return;

	/*
	 * We consume data at least once per second to check for errors as well
	 * as to let DTrace know we're still alive.
	 */
	this.cad_dtr.consume(this.error.bind(this));
};

insDTraceMetric.prototype.error = function (probe, record)
{
	if (!record['data'])
		return;

	if (probe['module'] != 'dtrace' || probe['name'] != 'ERROR')
		return;

	insd_log.dbg('DTRACE ERROR: %j', record['data']);
};

insDTraceMetric.prototype.value = function (callback)
{
	var agg = {};
	var iteragg = function (id, key, val) {
		if (!(id in agg))
			agg[id] = {};

		agg[id][key] = val;
	};

	/*
	 * If we failed to instrument, all we can do is return an error.
	 * Because the instrumenter won't call value() except after a successful
	 * instrument(), this can only happen if we successfully enable the
	 * instrumentation but DTrace aborts sometime later and we fail to
	 * reenable it.
	 */
	if (!this.cad_dtr)
		return (callback(undefined));

	try {
		this.cad_dtr.aggwalk(iteragg);
	} catch (ex) {
		/*
		 * In some cases (such as simple drops), we could reasonably
		 * ignore this and drive on.  Or we could stop this consumer,
		 * increase the buffer size, and re-enable.  In some cases,
		 * though, the consumer has already aborted so we have to create
		 * a new handle and re-enable.  For now, we deal with all of
		 * these the same way: create a new handle and re-enable.
		 * XXX this should be reported to the configuration service as
		 * an asynchronous instrumenter error.
		 * XXX shouldn't all log entries be reported back to the
		 * configuration service for debugging?
		 */
		insd_log.error('re-enabling instrumentation due to error ' +
		    'reading aggregation: %r', ex);
		this.instrument();
		return (callback(undefined));
	}

	return (callback(this.reduce(agg)));
};

function insDTraceVectorMetric(prog, hasdecomps, zero, hasdists)
{
	this.cadv_decomps = hasdecomps;
	this.cadv_zero = zero;
	if (!hasdecomps && zero === 0)
		this.cadv_adder = mod_caagg.caAddScalars;
	else if (!hasdecomps)
		this.cadv_adder = mod_caagg.caAddDistributions;
	else if (!hasdists)
		this.cadv_adder = function (lhs, rhs) {
			return (mod_caagg.caAddDecompositions(lhs, rhs));
		};
	else
		this.cadv_adder = function (lhs, rhs) {
			return (mod_caagg.caAddDecompositions(lhs, rhs,
			    mod_caagg.caAddDistributions));
		};

	insDTraceMetric.call(this, prog);
}

mod_sys.inherits(insDTraceVectorMetric, insDTraceMetric);

insDTraceVectorMetric.prototype.reduce = function (agg)
{
	var aggid;

	for (aggid in agg) {
		if (!this.cadv_decomps)
			return (agg[aggid]['']);

		return (agg[aggid]);
	}

	return (this.cadv_zero);
};

/*
 * This object is designed to hide the fact that we may be doing multiple
 * enablings under the hood. It itself has an array of insDTraceMetrics and
 * presents itself as an insDTraceMetric, though it is not an instance of one.
 *
 *	progs		An array of insDTraceMetrics
 */
function insDTraceMetricArray(progs)
{
	ASSERT.ok(progs !== undefined, 'missing progs arg');

	ASSERT.ok(progs instanceof Array, 'progs must be an array');

	ASSERT.ok(progs.length >= 1, 'progs must be an array with at least ' +
	    'one entry');

	this.cad_progs = progs;
}

insDTraceMetricArray.prototype.instrument = function (callback)
{
	var ii = 0;
	var funcs = this.cad_progs.map(function (x) {
		return (caWrapMethod(x, x.instrument));
	});

	mod_ca.caRunParallel(funcs, function (res) {
		if (res.nerrors === 0) {
			callback();
			return;
		}

		for (ii = 0; ii < res.length; ii++) {
			if ('result' in res.results[ii])
				this.cad_progs[ii].deinstrument();
		}

		var foo = new caError(ECA_REMOTE,
		    res.results[res.errlocs[0]]['error'],
		    'failed to enable %d DTrace enablings; saving first error',
		    res.nerrors);
		callback(foo);
	});
};

insDTraceMetricArray.prototype.deinstrument = function (callback)
{
	var funcs = this.cad_progs.map(function (x) {
		return (caWrapMethod(x, x.deinstrument));
	});

	mod_ca.caRunParallel(funcs, function (res) {
		if (res.nerrors === 0) {
			callback();
			return;
		}

		callback(new caError(ECA_REMOTE, res.results[res.errlocs[0]],
		    'failed to disable %d DTrace enablings; saving first error',
		    res.nerrors));
	});
};

/*
 * It is rather important that we make a copy of zero here. When we use
 * caAddDecompositions as our adder it modifies the left hand side of our value.
 * If we don't copy zero, the initial value will end up getting modified. This
 * can lead to an ever-increasing value.
 */
insDTraceMetricArray.prototype.value = function (callback)
{
	var adder = this.cad_progs[0].cadv_adder;
	var zero = caDeepCopy(this.cad_progs[0].cadv_zero);
	var data = [];

	/*
	 * We're assuming here that the value() functions are actually
	 * effectively synchronous.
	 */
	this.cad_progs.forEach(function (x) {
		x.value(function (val) {
			data.push(val === undefined ? x.cadv_zero : val);
		});
	});

	ASSERT.equal(this.cad_progs.length, data.length);
	return (callback(data.reduce(adder, zero)));
};
