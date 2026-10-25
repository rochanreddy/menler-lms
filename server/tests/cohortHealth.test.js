// When the weekly cohort health mail is allowed to go, and how it words a
// change. No database: the rules are pure functions of a clock.
//
//   node --test tests/cohortHealth.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { reportKeyFor } from '../utils/cohortHealth.js';
import { trendText, cohortHealthEmail } from '../utils/emailTemplates.js';

const ist = (s) => Date.parse(`${s}+05:30`);

test('the report window is Monday from 9am IST, keyed on that Monday', () => {
  assert.equal(reportKeyFor(ist('2026-10-26T09:00:00')), 'cohort-health:2026-10-26', 'Monday 9am');
  assert.equal(reportKeyFor(ist('2026-10-26T23:59:00')), 'cohort-health:2026-10-26', 'late Monday still sends');
  assert.equal(reportKeyFor(ist('2026-10-26T08:59:00')), null, 'not before nine');
  assert.equal(reportKeyFor(ist('2026-10-27T09:00:00')), null, 'not on Tuesday — a missed week is skipped');
  assert.equal(reportKeyFor(ist('2026-10-25T23:30:00')), null, 'Sunday night is not Monday, even in UTC terms');
});

test('Monday 1am IST is Sunday in UTC, and still not the window', () => {
  // 2026-10-26T01:00 IST = 2026-10-25T19:30Z.
  assert.equal(reportKeyFor(ist('2026-10-26T01:00:00')), null);
});

test('attendance trend reads as a change in points', () => {
  assert.equal(trendText(82, 76), '82% (▲ 6 pts from 76%)');
  assert.equal(trendText(60, 75), '60% (▼ 15 pts from 75%)');
  assert.equal(trendText(70, 70), '70% (same as last week)');
  assert.equal(trendText(70, null), '70%');
  assert.equal(trendText(null, 70), 'No attendance marked');
});

test('the mail names every batch and who has gone quiet', () => {
  const b = {
    id: '1', name: 'Generalist · Oct 2026', students: 30, classes: 2, attendance: 80, attendanceLastWeek: 90,
    rating: 4.5, ratingCount: 12, ratingLastWeek: 4.2, completion: 41, quiet: 2, quietNames: ['Asha', 'Ravi'], neverOpened: 1, doubtsAsked: 5, doubtsAnswered: 4,
  };
  const m = cohortHealthEmail({ from: new Date(ist('2026-10-19T09:00:00')), to: new Date(ist('2026-10-26T09:00:00')), batches: [b] });
  assert.match(m.subject, /^Cohort health · 19 Oct – 26 Oct$/);
  assert.match(m.text, /Attendance: 80% \(▼ 10 pts from 90%\)/);
  assert.match(m.text, /Gone quiet: 2 students — Asha, Ravi/);
  assert.match(m.text, /Never opened: 1 student$/m);
  assert.match(m.text, /Doubts: 4 of 5 answered by a mentor/);
  assert.match(m.html, /Generalist · Oct 2026/);
  assert.match(cohortHealthEmail({ from: new Date(), to: new Date(), batches: [] }).text, /No batches are running/);
});
