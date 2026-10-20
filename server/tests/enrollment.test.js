// Which classes a student owes a review for. Needs no database.
//
//   node --test tests/enrollment.test.js
//
// The bug this guards: the gate counted from the ACCOUNT's creation, so a
// student whose account was made days before they were put in a batch was met
// by a form for every class held in between.

import test from 'node:test';
import assert from 'node:assert/strict';

import { joinedBatchAt, wasEnrolledFor } from '../utils/enrollment.js';

const A = 'batchA';
const B = 'batchB';
const day = (n) => new Date(Date.UTC(2026, 9, n, 13, 30));

test('an account made before enrolment owes nothing from before it joined', () => {
  const user = { createdAt: day(1), batchJoins: [{ batchId: A, at: day(10) }] };
  assert.equal(wasEnrolledFor(user, { batchId: A, startsAt: day(5) }), false);
  assert.equal(wasEnrolledFor(user, { batchId: A, startsAt: day(12) }), true);
});

test('a second batch counts from its own join date, not the first one', () => {
  const user = {
    createdAt: day(1),
    batchJoins: [{ batchId: A, at: day(1) }, { batchId: B, at: day(15) }],
  };
  assert.equal(wasEnrolledFor(user, { batchId: A, startsAt: day(5) }), true);
  assert.equal(wasEnrolledFor(user, { batchId: B, startsAt: day(5) }), false);
  assert.equal(wasEnrolledFor(user, { batchId: B, startsAt: day(16) }), true);
});

test('a membership from before join dates existed falls back to the account', () => {
  const user = { createdAt: day(8), batchJoins: [] };
  assert.equal(joinedBatchAt(user, A).getTime(), day(8).getTime());
  assert.equal(wasEnrolledFor(user, { batchId: A, startsAt: day(7) }), false);
  assert.equal(wasEnrolledFor(user, { batchId: A, startsAt: day(9) }), true);
});

test('a join row never reaches back before the account existed', () => {
  const user = { createdAt: day(8), batchJoins: [{ batchId: A, at: day(2) }] };
  assert.equal(joinedBatchAt(user, A).getTime(), day(8).getTime());
});

test('a populated batch on the session is read by its id', () => {
  const user = { createdAt: day(1), batchJoins: [{ batchId: A, at: day(10) }] };
  assert.equal(wasEnrolledFor(user, { batchId: { _id: A, name: 'x' }, startsAt: day(5) }), false);
});

test('ids compare as strings, so an ObjectId and its hex agree', () => {
  const id = { toString: () => 'abc123' };
  const user = { createdAt: day(1), batchJoins: [{ batchId: id, at: day(10) }] };
  assert.equal(joinedBatchAt(user, 'abc123').getTime(), day(10).getTime());
});
