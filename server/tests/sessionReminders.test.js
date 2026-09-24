// When the two class reminders are due, and — more to the point — when they
// are NOT. Needs no database: reminderWindows() is pure arithmetic over a
// clock, which is exactly why it was split out.
//
//   node --test tests/sessionReminders.test.js
//
// The cases that matter here are the refusals. A window that is too narrow
// silently mails nobody; one that reaches too far back mails a whole cohort
// about a class that finished while the server was down. Neither throws, so
// neither shows up anywhere except in a student's inbox.

import test from 'node:test';
import assert from 'node:assert/strict';

import { reminderWindows, LEAD_MS } from '../utils/sessionReminders.js';

const MIN = 60 * 1000;
const NOW = Date.parse('2026-09-24T13:00:00+05:30');

/** Does a class starting at `startsAt` fall in this window? Mirrors what
 *  Mongo does with { $gt, $lte } — exclusive early, inclusive late. */
const hits = (win, startsAt) => startsAt > win.startsAt.$gt.getTime()
  && startsAt <= win.startsAt.$lte.getTime();

const at = (offsetMs) => NOW + offsetMs;

test('the hour-before mail goes out in the hour before, and not outside it', () => {
  const { hour } = reminderWindows(NOW);

  assert.equal(hits(hour, at(LEAD_MS)), true, 'a class exactly an hour away is due');
  assert.equal(hits(hour, at(50 * MIN)), true, '50 minutes out is still due');
  assert.equal(hits(hour, at(46 * MIN)), true, '46 minutes out is the late edge of catch-up');

  assert.equal(hits(hour, at(61 * MIN)), false, 'an hour and a minute out is too early');
  assert.equal(hits(hour, at(44 * MIN)), false, 'inside 45 minutes it is too late to claim an hour');
  assert.equal(hits(hour, at(5 * MIN)), false, 'about to start is not an hour away');
  assert.equal(hits(hour, at(-MIN)), false, 'already started is never an hour away');
});

test('the starting-now mail goes out as the class begins, never before', () => {
  const { start } = reminderWindows(NOW);

  assert.equal(hits(start, at(0)), true, 'a class starting this instant is due');
  assert.equal(hits(start, at(-MIN)), true, 'a minute in, a late tick still catches it');
  assert.equal(hits(start, at(-9 * MIN)), true, 'nine minutes in is the last moment worth sending');

  assert.equal(hits(start, at(MIN)), false, 'a minute early is not "starting now"');
  assert.equal(hits(start, at(30 * MIN)), false, 'half an hour early is certainly not');
});

// The whole point of a bounded look-back: a server down for hours must wake up
// and mail nobody about what it slept through.
test('a class that has been and gone gets neither mail', () => {
  const { hour, start } = reminderWindows(NOW);
  for (const late of [11 * MIN, 30 * MIN, 3 * 60 * MIN, 8 * 24 * 60 * MIN]) {
    assert.equal(hits(hour, at(-late)), false, `hour-before must not fire ${late / MIN}m late`);
    assert.equal(hits(start, at(-late)), false, `starting-now must not fire ${late / MIN}m late`);
  }
});

// A class is a candidate for one mail or the other, never both on one tick —
// otherwise a cohort gets two emails in the same minute.
test('the two windows never overlap', () => {
  const { hour, start } = reminderWindows(NOW);
  for (let m = -30; m <= 90; m += 1) {
    const t = at(m * MIN);
    assert.equal(hits(hour, t) && hits(start, t), false, `${m}m matched both windows`);
  }
});

// Ticks stop during a deploy. A window only a tick wide would let a restart
// land on a class's one chance and drop it silently; this is the guarantee
// that a stalled minute makes the mail late rather than absent.
test('a stalled tick delays the hour-before mail instead of losing it', () => {
  const classAt = at(LEAD_MS); // due at the 13:00 tick

  // Ticks 13:00 through 13:14 are missed entirely; the first one back is 13:15.
  const late = reminderWindows(NOW + 14 * MIN);
  assert.equal(hits(late.hour, classAt), true, 'still due after a 14-minute stall');

  // Past the catch-up grace it is genuinely gone, and that is deliberate —
  // "starts in about an hour" would be a lie about a class 44 minutes away.
  const tooLate = reminderWindows(NOW + 16 * MIN);
  assert.equal(hits(tooLate.hour, classAt), false, 'past the grace it is dropped, not mis-sent');
});

// Every tick that finds nothing is the common case; it must be cheap and, more
// importantly, must not accidentally select the whole table.
test('the windows are always bounded on both sides', () => {
  const { hour, start } = reminderWindows(NOW);
  for (const w of [hour, start]) {
    assert.ok(w.startsAt.$gt instanceof Date);
    assert.ok(w.startsAt.$lte instanceof Date);
    assert.ok(w.startsAt.$gt.getTime() < w.startsAt.$lte.getTime());
  }
  assert.equal(hour.remindedHourAt, null, 'the claim guard must be part of the query');
  assert.equal(start.remindedStartAt, null, 'the claim guard must be part of the query');
});

// Which transports a cohort send is allowed to ride on. The default matters:
// Resend is already configured in production, so a deploy that arrives before
// the ZeptoMail token must send nothing rather than half a classroom.
test('reminders refuse a transport that cannot take a whole cohort', async (t) => {
  const { canSendReminders } = await import('../utils/sessionReminders.js');
  const keys = ['ZEPTOMAIL_TOKEN', 'RESEND_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'REMINDERS_ALLOW_RESEND'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const set = (env) => {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
  };
  t.after(() => {
    for (const k of keys) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  });

  set({});
  assert.equal(canSendReminders(), false, 'nothing configured');

  set({ RESEND_API_KEY: 'x' });
  assert.equal(canSendReminders(), false, 'Resend alone must not carry a cohort');

  set({ RESEND_API_KEY: 'x', REMINDERS_ALLOW_RESEND: '1' });
  assert.equal(canSendReminders(), true, 'unless someone says the plan is paid');

  set({ ZEPTOMAIL_TOKEN: 'x' });
  assert.equal(canSendReminders(), true, 'ZeptoMail is the intended transport');

  set({ ZEPTOMAIL_TOKEN: 'x', RESEND_API_KEY: 'y' });
  assert.equal(canSendReminders(), true, 'ZeptoMail wins when both are set');

  set({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' });
  assert.equal(canSendReminders(), true, 'SMTP has no daily wall');
});
