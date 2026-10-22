// Which batch sees a teacher note. Needs no database.
//
//   node --test tests/materialScope.test.js
//
// Both ways of getting this wrong are silent: a new intake quietly reading the
// last cohort's mentor's decks, or a running cohort quietly losing the notes
// it was taught from. So each is pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { materialInBatch, materialInAny, materialTime, scopeMaterials } from '../utils/materialScope.js';

const sept = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', createdAt: '2026-09-01T00:00:00Z' };
const nov = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', createdAt: '2026-10-25T00:00:00Z' };

test('a note pushed to a batch is that batch\'s alone', () => {
  const m = { url: 'x', addedAt: '2026-11-10T00:00:00Z', batchIds: [nov._id] };
  assert.equal(materialInBatch(m, nov), true);
  assert.equal(materialInBatch(m, sept), false, 'a November note must not reach September, though September is older');
});

test('a note from before per-batch notes stays with the batches that existed', () => {
  const m = { url: 'x', addedAt: '2026-10-01T00:00:00Z' };
  assert.equal(materialInBatch(m, sept), true, 'September keeps what it was taught from');
  assert.equal(materialInBatch(m, nov), false, 'a batch created later never sees it');
});

test('a legacy note with no addedAt is dated by its ObjectId', () => {
  // 0x68dc4b00 = 2025-09-30T21:33:52Z: older than both batches.
  const old = { _id: '68dc4b00aaaaaaaaaaaaaaaa', url: 'x' };
  assert.equal(materialTime(old), 0x68dc4b00 * 1000);
  assert.equal(materialInBatch(old, sept), false);
  assert.equal(materialInBatch(old, nov), false);
});

test('a note pushed to two batches reaches both', () => {
  const m = { url: 'x', addedAt: '2026-11-10T00:00:00Z', batchIds: [sept._id, nov._id] };
  assert.equal(materialInAny(m, [sept]), true);
  assert.equal(materialInAny(m, [nov]), true);
  assert.equal(materialInAny(m, []), false, 'a student in no batch of it sees nothing');
});

test('scopeMaterials cuts every level of the tree and leaves the rest alone', () => {
  const sep = { url: 'sep', addedAt: '2026-10-01T00:00:00Z' };
  const nv = { url: 'nov', addedAt: '2026-11-10T00:00:00Z', batchIds: [nov._id] };
  const program = {
    _id: 'p', title: 'AI Generalist',
    modules: [{
      title: 'WEEK 1', notesUrl: '/uploads/abc', materials: [sep, nv],
      chapters: [{ title: 'S1', materials: [sep], topics: [{ title: 'L', readingUrl: '/uploads/r', materials: [nv, sep] }] }],
    }],
  };
  const forNov = scopeMaterials(program, [nov]);
  assert.deepEqual(forNov.modules[0].materials.map((m) => m.url), ['nov']);
  assert.deepEqual(forNov.modules[0].chapters[0].materials, []);
  assert.deepEqual(forNov.modules[0].chapters[0].topics[0].materials.map((m) => m.url), ['nov']);
  // The curriculum's own files are not teacher notes and are untouched.
  assert.equal(forNov.modules[0].notesUrl, '/uploads/abc');
  assert.equal(forNov.modules[0].chapters[0].topics[0].readingUrl, '/uploads/r');

  const forSept = scopeMaterials(program, [sept]);
  assert.deepEqual(forSept.modules[0].materials.map((m) => m.url), ['sep']);
  // The input is not mutated: the mentor's and admin's copy stays whole.
  assert.equal(program.modules[0].materials.length, 2);
});
