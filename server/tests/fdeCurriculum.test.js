// The AI Engineering Fellowship's tree against the numbers its PDF promises,
// and against the three things that read that tree: the class scheduler, the
// assignment sync and the rubric classifier. No database, no network.
//
//   node --test tests/fdeCurriculum.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { FDE_CASES, FDE_WEEKS, fdeModules } from '../scripts/curricula.js';
import { PROGRAMS } from '../scripts/syncCurriculumAssignments.js';
import { PROGRAMME_TITLES, titleQuery } from '../utils/programmes.js';
import { segmentFor } from '../utils/certificates.js';

const modules = fdeModules();
const chapters = modules.flatMap((m) => m.chapters);
const sync = PROGRAMS.find((p) => p.title === PROGRAMME_TITLES.engineering);
const items = sync.build({ modules });

test('12 weeks, 24 sessions, 6 cases', () => {
  assert.equal(modules.length, 12);
  assert.equal(FDE_CASES.length, 6);
  assert.equal(chapters.filter((c) => /^S\d+\s*·/.test(c.title)).length, 24);
  assert.equal(chapters.filter((c) => /^Case \d/.test(c.title)).length, 6);
  assert.equal(chapters.filter((c) => /^Lab:/.test(c.title)).length, 3);
  modules.forEach((m, i) => assert.match(m.title, new RegExp(`^WEEK ${i + 1} · `)));
});

test('every chapter has a page, so every row in the rail folds the same way', () => {
  assert.deepEqual(chapters.filter((c) => !c.description?.trim()).map((c) => c.title), []);
});

test('Week 1 opens on its case, the way every block does', () => {
  assert.match(modules[0].chapters[0].title, /^Case 1 · /);
  assert.ok(!chapters.some((c) => /^Start Here/.test(c.title)));
});

test('C001 to C100 and K01 to K20, in order, none repeated', () => {
  const codes = FDE_WEEKS.flatMap((w) => w.sessions.flatMap((s) => s.topics.map((t) => t[0])));
  const want = [
    ...Array.from({ length: 100 }, (_, i) => `C${String(i + 1).padStart(3, '0')}`),
    ...Array.from({ length: 20 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`),
  ];
  assert.deepEqual(codes, want);
});

test('every topic says what it teaches and carries a hands-on task', () => {
  for (const w of FDE_WEEKS) for (const s of w.sessions) {
    assert.equal(s.topics.length, 5);
    for (const row of s.topics) {
      assert.equal(row.length, 4, row[0]);
      row.forEach((cell) => assert.ok(cell.trim(), row[0]));
    }
  }
});

test('the sync finds 12 assignments and 6 projects, grouped by week', () => {
  assert.equal(items.filter((i) => i.type === 'assignment').length, 12);
  assert.equal(items.filter((i) => i.type === 'project').length, 6);
  assert.deepEqual([...new Set(items.map((i) => i.week))], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(items.filter((i) => i.type === 'project').map((i) => i.week), [2, 4, 6, 8, 10, 12]);
});

test('a checkpoint is on the project brief, not a row of its own', () => {
  assert.ok(!chapters.some((c) => /Checkpoint/.test(c.title)));
  const milestones = chapters.filter((c) => /^Milestone Project/.test(c.title));
  assert.equal(milestones.length, 6);
  for (const m of milestones) assert.match(m.description, /## Foundation checkpoint \(Week A\)/);
});

test('titles are unique, because the sync and the brief chips match on them', () => {
  const titles = items.map((i) => i.title);
  assert.equal(new Set(titles).size, titles.length);
});

test('every piece of work is in the rubric table, not guessed', () => {
  assert.deepEqual(items.filter((i) => !i.matchedByTitle).map((i) => i.title), []);
});

test('the Generalist milestone classes do not leak onto the same numbers', () => {
  const cls = (n) => items.find((i) => i.title.startsWith(`Milestone Project ${n} ·`)).rubricClass;
  assert.equal(cls(2), 'C'); // Generalist's 2 is a media kit, class D
  assert.equal(cls(4), 'C'); // Generalist's 4 is its capstone, class E
  assert.equal(cls(6), 'E');
});

test('every piece of work has a checklist of deliverables', () => {
  for (const it of items) assert.ok(it.deliverables.length >= 2, it.title);
});

test('the folder demands a video only where the brief asks for a recording', () => {
  const video = items.filter((i) => i.requiredDriveTypes.includes('video')).map((i) => i.title);
  assert.deepEqual(video, ['Weekly Assignment: ROI Model, SOW & Handover Pack', 'Milestone Project 5 · Production NDR Recovery System']);
  for (const it of items) {
    assert.ok(it.requiredDriveTypes.includes('doc'), it.title);
    assert.ok(!it.requiredDriveTypes.includes('image'), it.title);
  }
});

test('the programme resolves under its title and its certificate segment', () => {
  assert.equal(segmentFor({ title: PROGRAMME_TITLES.engineering }), 'AIFEL');
  assert.ok(titleQuery(PROGRAMME_TITLES.engineering).title.$in.includes(PROGRAMME_TITLES.engineering));
});
