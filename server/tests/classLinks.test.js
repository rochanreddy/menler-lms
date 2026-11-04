// Which Drive a batch's class videos open. Needs no database.
//
//   node --test tests/classLinks.test.js
//
// Both ways of getting this wrong are silent: a new intake quietly watching the
// last cohort's classes, or a running cohort quietly losing its recordings. So
// each is pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { classLinkFor, cleanClassDrive, scopeClassLinks } from '../utils/classLinks.js';

const SHARED = 'https://drive.google.com/drive/folders/september';
const NOV_DRIVE = 'https://drive.google.com/drive/folders/november';

const sept = { _id: 'a', classDriveUrl: null };
const beforeTheField = { _id: 'b' }; // a lean() row that has never had one
const novEmpty = { _id: 'c', classDriveUrl: '' };
const novOwn = { _id: 'd', classDriveUrl: NOV_DRIVE };

test('a running cohort keeps the curriculum link', () => {
  assert.equal(classLinkFor(SHARED, [sept]), SHARED);
  assert.equal(classLinkFor(SHARED, [beforeTheField]), SHARED, 'no field at all means the same as null');
});

test('a batch with no Drive yet gets nothing, not the last cohort\'s', () => {
  assert.equal(classLinkFor(SHARED, [novEmpty]), '');
});

test('a batch with its own Drive opens that', () => {
  assert.equal(classLinkFor(SHARED, [novOwn]), NOV_DRIVE);
});

test('a lesson with no class has no video, whatever the batch posted', () => {
  assert.equal(classLinkFor('', [novOwn]), '', 'an assignment must not grow a Watch class video chip');
  assert.equal(classLinkFor('', [sept]), '');
});

test('in two batches, the one holding a link wins over the one without', () => {
  assert.equal(classLinkFor(SHARED, [novEmpty, sept]), SHARED);
  assert.equal(classLinkFor(SHARED, [novEmpty, novOwn]), NOV_DRIVE);
});

test('no batch is nothing, never the shared link', () => {
  assert.equal(classLinkFor(SHARED, []), '');
  assert.equal(classLinkFor(SHARED, undefined), '');
});

test('scoping a tree changes the link and leaves everything else', () => {
  const program = {
    title: 'AI Generalist',
    modules: [{
      title: 'WEEK 1',
      chapters: [{
        title: 'S1',
        topics: [
          { _id: 't1', title: 'Key topics covered', classLink: SHARED, body: 'keep me' },
          { _id: 't2', title: 'Submission', classLink: '' },
        ],
      }],
    }],
  };
  const { topics } = scopeClassLinks(program, [novEmpty]).modules[0].chapters[0];
  assert.equal(topics[0].classLink, '');
  assert.equal(topics[0].body, 'keep me');
  assert.equal(topics[0]._id, 't1', 'lesson ids are load-bearing');
  assert.equal(program.modules[0].chapters[0].topics[0].classLink, SHARED, 'the tree passed in is not touched');
});

test('only an http(s) link can be stored, because it is rendered as an href', () => {
  assert.equal(cleanClassDrive(`  ${NOV_DRIVE} `), NOV_DRIVE);
  assert.equal(cleanClassDrive(''), '', 'clearing it means no Drive yet');
  assert.equal(cleanClassDrive(null), null, 'null hands it back to the curriculum');
  assert.equal(cleanClassDrive('javascript:alert(1)'), undefined);
  assert.equal(cleanClassDrive('drive.google.com/x'), undefined);
  assert.equal(cleanClassDrive('https://a b'), undefined);
});
