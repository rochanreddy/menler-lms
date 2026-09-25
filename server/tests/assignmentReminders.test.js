// When the two assignment mails go out, and — more to the point — when they
// do not. No database: the rules are pure functions of the record and a clock.
//
//   node --test tests/assignmentReminders.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  openMailDue, dueReminderDue, assignmentWindows, DUE_LEAD_MS,
} from '../utils/assignmentReminders.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = Date.parse('2026-09-25T10:00:00+05:30');
const at = (ms) => new Date(NOW + ms);

const a = (over = {}) => ({
  startDate: null, dueDate: null, createdAt: at(-30 * 24 * HOUR), openMailedAt: null, dueReminderFor: null, ...over,
});

test('the open mail goes when a dated assignment opens', () => {
  assert.equal(openMailDue(a({ startDate: at(0), dueDate: at(7 * 24 * HOUR) }), NOW), true, 'opens this minute');
  assert.equal(openMailDue(a({ startDate: at(-20 * MIN) }), NOW), true, 'a tick delayed by a deploy still sends');
  assert.equal(openMailDue(a({ startDate: at(MIN) }), NOW), false, 'not before it opens');
  assert.equal(openMailDue(a({ startDate: at(-45 * MIN) }), NOW), false, 'not long after — the grace is 30 min');
});

test('with no start date, "opens" is when it was created — but only if it is dated', () => {
  assert.equal(openMailDue(a({ createdAt: at(-MIN), dueDate: at(3 * 24 * HOUR) }), NOW), true,
    'created a minute ago with a deadline');
  // The curriculum sync creates a whole programme's assignments at once, undated.
  assert.equal(openMailDue(a({ createdAt: at(-MIN) }), NOW), false,
    'an undated placeholder is never announced');
});

test('the open mail goes once, and never for something already past due', () => {
  assert.equal(openMailDue(a({ startDate: at(0), openMailedAt: at(0) }), NOW), false, 'already sent');
  assert.equal(openMailDue(a({ startDate: at(-MIN), dueDate: at(-MIN) }), NOW), false, 'opened after its own cutoff');
});

test('the due reminder goes 24 hours before the deadline', () => {
  assert.equal(dueReminderDue(a({ dueDate: at(DUE_LEAD_MS) }), NOW), true, 'exactly 24h out');
  assert.equal(dueReminderDue(a({ dueDate: at(DUE_LEAD_MS - 20 * MIN) }), NOW), true, 'a late tick still sends');
  assert.equal(dueReminderDue(a({ dueDate: at(DUE_LEAD_MS + MIN) }), NOW), false, 'too early');
  assert.equal(dueReminderDue(a({ dueDate: at(DUE_LEAD_MS - 45 * MIN) }), NOW), false, 'too late to say "24 hours"');
  assert.equal(dueReminderDue(a({ dueDate: at(2 * HOUR) }), NOW), false, 'set with only two hours to go: no "24 hours" mail');
  assert.equal(dueReminderDue(a(), NOW), false, 'no deadline, nothing to remind about');
});

test('an extended deadline gets its own reminder; the same one does not repeat', () => {
  const due = at(DUE_LEAD_MS);
  assert.equal(dueReminderDue(a({ dueDate: due, dueReminderFor: due }), NOW), false, 'already reminded about this date');
  assert.equal(dueReminderDue(a({ dueDate: due, dueReminderFor: at(-2 * 24 * HOUR) }), NOW), true,
    'reminded about the old date, not this one');
});

test('the queries are bounded and carry their claim guards', () => {
  const w = assignmentWindows(NOW);
  assert.equal(w.open.openMailedAt, null);
  for (const branch of w.open.$or) {
    const range = branch.startDate?.$gt ? branch.startDate : branch.createdAt;
    assert.ok(range.$gt < range.$lte);
  }
  assert.ok(w.due.dueDate.$gt < w.due.dueDate.$lte);
  assert.deepEqual(w.due.$expr, { $ne: ['$dueReminderFor', '$dueDate'] });
});
