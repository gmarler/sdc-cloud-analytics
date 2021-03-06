/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * DTrace metric for Manta tasks executed
 */
var mod_ca = require('../../../../lib/ca/ca-common');

var desc = {
    module: 'mantaop',
    stat: 'tasks_executed',
    fields: [ 'hostname', 'jobid', 'latency' ],
    metad: {
	probedesc: [ {
	    probes: [ 'marlin-agent*:::task-dispatched' ],
	    gather: {
		latency: {
			gather: 'timestamp',
			store: 'global[pid,copyinstr(arg1)]'
		}
	    }
	}, {
	    probes: [ 'marlin-agent*:::task-done' ],
	    verify: {
		latency: '$0[pid,copyinstr(arg1)]'
	    },
	    transforms: {
		hostname: '"' + mod_ca.caSysinfo().ca_hostname + '"',
		jobid: 'copyinstr(arg0)',
		latency: 'timestamp - $0[pid,copyinstr(arg1)]'
	    },
	    aggregate: {
		default: 'count()',
		hostname: 'count()',
		jobid: 'count()',
		latency: 'llquantize($0, 10, 3, 11, 100)'
	    }
	}, {
	    probes: [ 'marlin-supervisor*:::task-done' ],
	    clean: {
		latency: '$0[pid,copyinstr(arg1)]'
	    }
	} ]
    }
};

exports.cadMetricDesc = desc;
