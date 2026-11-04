// A student in two batches. Needs no database.
//
//   node --test tests/studentBatches.test.js
//
// Getting these wrong is silent: a student's graded work quietly looking
// unsubmitted, or the dropdown quietly showing another cohort's classes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { inView, onePerWork, pickActiveBatch } from '../utils/studentBatches.js';

const GEN = 'gen';
const KICK = 'kick';
const sept = { _id: 'sept', programId: GEN, startDate: '2026-09-01T00:00:00Z', createdAt: '2026-09-05T00:00:00Z' };
const nov = { _id: 'nov', programId: GEN, startDate: '2026-11-14T00:00:00Z', createdAt: '2026-10-22T00:00:00Z' };
const kick = { _id: 'k', programId: KICK, startDate: '2026-09-01T00:00:00Z', createdAt: '2026-09-05T00:00:00Z' };

const row = (id, batch, title) => ({ _id: id, batchId: batch._id, title });
const ids = (list) => list.map((a) => a._id);
const subs = (byId) => (id) => byId[id] || null;

test('the batch asked for is the batch in view', () => {
  assert.equal(pickActiveBatch([sept, nov], 'sept'), sept);
  assert.equal(pickActiveBatch([sept, nov], 'nov'), nov);
});

test('with nothing chosen, the newest intake opens', () => {
  assert.equal(pickActiveBatch([sept, nov], undefined), nov);
  assert.equal(pickActiveBatch([nov, sept], ''), nov, 'the order they come back in does not matter');
});

test('a batch with no start date ranks by when it was made', () => {
  const noDate = { _id: 'x', programId: GEN, createdAt: '2026-12-01T00:00:00Z' };
  assert.equal(pickActiveBatch([sept, noDate], ''), noDate);
});

test('an id the student is not in widens nothing and refuses nothing', () => {
  assert.equal(pickActiveBatch([sept, nov], 'someone-elses-batch'), nov);
  assert.equal(pickActiveBatch([], 'anything'), null);
});

test('in view: the other batch of the same programme goes', () => {
  assert.deepEqual(inView([sept, nov], 'sept'), [sept]);
  assert.deepEqual(inView([sept, nov], 'nov'), [nov]);
});

test('in view: another programme\'s batch stays, or its notes would empty', () => {
  assert.deepEqual(ids(inView([sept, kick], 'sept')), ['sept', 'k']);
  assert.deepEqual(ids(inView([sept, nov, kick], 'k')), ['sept', 'nov', 'k'], 'a programme not in view keeps all of its batches');
});

test('in view: one batch is left alone', () => {
  assert.deepEqual(inView([sept], 'nov'), [sept]);
  assert.deepEqual(inView([], 'nov'), []);
});

test('a piece of work shows once, on the row holding the student\'s work', () => {
  const rows = [row('a-sept', sept, 'Report'), row('a-nov', nov, 'Report')];
  assert.deepEqual(ids(onePerWork(rows, subs({ 'a-sept': { status: 'graded', score: 8 } }), [sept, nov])), ['a-sept']);
});

test('nothing handed in yet goes to the newest batch', () => {
  const rows = [row('a-sept', sept, 'Report'), row('a-nov', nov, 'Report')];
  assert.deepEqual(ids(onePerWork(rows, subs({}), [sept, nov])), ['a-nov']);
});

test('work handed in on the newer row stays there', () => {
  const rows = [row('a-sept', sept, 'Report'), row('a-nov', nov, 'Report')];
  assert.deepEqual(ids(onePerWork(rows, subs({ 'a-nov': { status: 'submitted' } }), [sept, nov])), ['a-nov']);
});

test('if both rows hold work, the graded one is what shows', () => {
  const rows = [row('a-sept', sept, 'Report'), row('a-nov', nov, 'Report')];
  const both = subs({ 'a-sept': { status: 'graded', score: 7 }, 'a-nov': { status: 'submitted' } });
  assert.deepEqual(ids(onePerWork(rows, both, [sept, nov])), ['a-sept']);
});

test('the same title in two programmes is two pieces of work', () => {
  const rows = [row('a-gen', sept, 'Report'), row('a-kick', kick, 'Report')];
  assert.deepEqual(ids(onePerWork(rows, subs({}), [sept, kick])), ['a-gen', 'a-kick']);
});

test('a populated batch reads the same as an id', () => {
  const rows = [{ _id: 'a-sept', batchId: sept, title: 'Report' }, { _id: 'a-nov', batchId: nov, title: 'Report' }];
  assert.deepEqual(ids(onePerWork(rows, subs({}), [sept, nov])), ['a-nov']);
});

test('work set for one batch alone stays, and the order holds', () => {
  const rows = [row('extra', sept, 'Extra'), row('a-sept', sept, 'Report'), row('a-nov', nov, 'Report'), row('last', nov, 'Last')];
  assert.deepEqual(ids(onePerWork(rows, subs({ 'a-sept': { status: 'submitted' } }), [sept, nov])), ['extra', 'a-sept', 'last']);
});
