/*
 * Tests caDatasetHeatmapScalar.
 */

var mod_assert = require('assert');
var mod_ca = require('../../lib/ca/ca-common');
var mod_caagg = require('../../lib/ca/ca-agg');
var mod_tl = require('../../lib/tst/ca-test');

var dataset = mod_caagg.caDatasetForInstrumentation({
	'value-arity': mod_ca.ca_arity_numeric,
	'value-dimension': 2,
	'granularity': 1
    });

var source1 = 'source1';
var source2 = 'source2';
var source3 = 'source3';

var time1 = 12340;
var time2 = 12345;

/* initial state: all zeros */
mod_assert.deepEqual(dataset.dataForTime(time1), []);
mod_assert.deepEqual(dataset.dataForTime(time2), []);
mod_assert.deepEqual(dataset.dataForKey('foo'), {});
mod_assert.deepEqual(dataset.keysForTime(time1), []);
mod_assert.deepEqual(dataset.total(), {});

/* single update */
dataset.update(source1, time1, [
	[[10, 20], 10],
	[[40, 50], 27]
]);
mod_assert.deepEqual(dataset.dataForTime(time1), [
	[[10, 20], 10],
	[[40, 50], 27]
]);
mod_assert.deepEqual(dataset.dataForTime(time2), []);

/* aggregating update */
dataset.update(source2, time1, [
	[[ 0, 10], 13],
	[[10, 20], 15],
	[[30, 40],  7],
	[[40, 50],  3]
]);
mod_assert.deepEqual(dataset.dataForTime(time1), [
	[[ 0, 10], 13],
	[[10, 20], 25],
	[[30, 40],  7],
	[[40, 50], 30]
]);
mod_assert.deepEqual(dataset.dataForTime(time2), []);

/* another aggregating update */
dataset.update(source3, time1, [
	[[ 0, 10], 2],
	[[60, 70], 7]
]);
mod_assert.deepEqual(dataset.dataForTime(time1), [
	[[ 0, 10], 15],
	[[10, 20], 25],
	[[30, 40],  7],
	[[40, 50], 30],
	[[60, 70],  7]
]);
mod_assert.deepEqual(dataset.dataForTime(time2), []);

/* update time2 */
dataset.update(source1, time2, [[5, 15], 12]);
mod_assert.deepEqual(dataset.dataForTime(time1), [
	[[ 0, 10], 15],
	[[10, 20], 25],
	[[30, 40],  7],
	[[40, 50], 30],
	[[60, 70],  7]
]);
mod_assert.deepEqual(dataset.dataForTime(time2), [[5, 15], 12]);

/* heatmap-specific functions */
var total = {};
total[time1] = [
    [[ 0, 10], 15],
    [[10, 20], 25],
    [[30, 40],  7],
    [[40, 50], 30],
    [[60, 70],  7]
];
total[time2] = [[5, 15], 12];
mod_assert.deepEqual(dataset.total(), total);
mod_assert.deepEqual(dataset.keysForTime(time1, 1), []);
mod_assert.deepEqual(dataset.keysForTime(time1, 10), []);
mod_assert.deepEqual(dataset.dataForKey('foo'), {});

/* don't expire old data */
dataset.expireBefore(time1);
mod_assert.deepEqual(dataset.dataForTime(time1), [
	[[ 0, 10], 15],
	[[10, 20], 25],
	[[30, 40],  7],
	[[40, 50], 30],
	[[60, 70],  7]
]);
mod_assert.deepEqual(dataset.dataForTime(time2), [[5, 15], 12]);

/* expire old data */
dataset.expireBefore(time1 + 1);
mod_assert.deepEqual(dataset.dataForTime(time1), []);
mod_assert.deepEqual(dataset.dataForTime(time2), [[5, 15], 12]);

/* undefined value */
dataset.update(source1, time1, undefined);
mod_assert.equal(dataset.nreporting(time1, 1), 1);
mod_assert.deepEqual(dataset.dataForTime(time1), []);

/* granularity > 0 */
dataset = mod_caagg.caDatasetForInstrumentation({
    'value-arity': mod_ca.ca_arity_numeric,
    'value-dimension': 2,
    'granularity': 10
});

/* initial state */
mod_assert.deepEqual([], dataset.dataForTime(123450));

/* data properly aligned */
dataset.update(source1, 123450, [[[10, 20], 5 ]]);
mod_assert.deepEqual([], dataset.dataForTime(123440));
mod_assert.deepEqual([[[10, 20], 5 ]], dataset.dataForTime(123450));
mod_assert.deepEqual([], dataset.dataForTime(123460));

/* data not aligned */
dataset.update(source1, 123449, [[[10, 20], 4 ]]);
mod_assert.deepEqual([[[10, 20], 4 ]], dataset.dataForTime(123440));
mod_assert.deepEqual([[[10, 20], 5 ]], dataset.dataForTime(123450));
mod_assert.deepEqual([], dataset.dataForTime(123460));

dataset.update(source1, 123451, [[[10, 20], 3 ]]);
mod_assert.deepEqual([[[10, 20], 4 ]], dataset.dataForTime(123440));
mod_assert.deepEqual([[[10, 20], 8 ]], dataset.dataForTime(123450));
mod_assert.deepEqual([], dataset.dataForTime(123460));

dataset.update(source1, 123459, [[[10, 20], 2 ]]);
mod_assert.deepEqual([[[10, 20], 4 ]], dataset.dataForTime(123440));
mod_assert.deepEqual([[[10, 20], 10 ]], dataset.dataForTime(123450));
mod_assert.deepEqual([], dataset.dataForTime(123460));

dataset.update(source1, 123460, [[[10, 20], 1 ]]);
mod_assert.deepEqual([[[10, 20], 4 ]], dataset.dataForTime(123440));
mod_assert.deepEqual([[[10, 20], 10 ]], dataset.dataForTime(123450));
mod_assert.deepEqual([[[10, 20], 1 ]], dataset.dataForTime(123460));
