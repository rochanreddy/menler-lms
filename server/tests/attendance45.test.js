// The 45% attendance rule, end to end.
//
// Runs against a LOCAL throwaway database and refuses to start against
// anything else — this logic decides whether real students keep their
// attendance, so it is proved somewhere that cannot touch them.
//
//   node --test tests/attendance45.test.js
//
// Needs a mongod on 127.0.0.1:27017. Override with LOCAL_TEST_MONGODB_URI,
// which must still be a localhost URI ending in _test.

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { recordJoin, recordLeave } from '../utils/presence.js';
import { applyPresenceRule } from '../utils/attendanceSweep.js';
import { requiredMs, MIN_SHARE } from '../utils/attendanceRule.js';

const URI = process.env.LOCAL_TEST_MONGODB_URI
  || 'mongodb://127.0.0.1:27017/menler_lms_presence_test';

// The guard. A remote URI here would run destructive setup against real data.
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URI) || !/_test(\?|$)/.test(URI)) {
  throw new Error(`Refusing to run: ${URI} is not a local _test database.`);
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** A two-hour class starting at a fixed instant, so every case reads in
 *  round numbers: the bar is 45% of 2h = 54 minutes. */
const START = Date.parse('2026-09-12T19:00:00+05:30');
const TWO_HOURS = 2 * HOUR;

let batchId;

async function makeSession({ ends = true } = {}) {
  return Session.create({
    batchId,
    title: 'S01 · test',
    startsAt: new Date(START),
    endsAt: ends ? new Date(START + TWO_HOURS) : null,
    zoomMeetingId: '86793830366',
  });
}

async function makeStudent(name) {
  const u = await User.create({
    name,
    email: `${name}@test.local`,
    passwordHash: 'x',
    role: 'student',
  });
  await Batch.updateOne({ _id: batchId }, { $addToSet: { studentIds: u._id } });
  return u;
}

const statusOf = async (session, student) =>
  (await Attendance.findOne({ sessionId: session._id, studentId: student._id }).lean());

test.before(async () => {
  await mongoose.connect(URI);
  await Promise.all([
    Session.deleteMany({}), Batch.deleteMany({}), User.deleteMany({}), Attendance.deleteMany({}),
    Program.deleteMany({}),
  ]);
  // A batch belongs to a programme, so the fixture needs one to hang off.
  const p = await Program.create({ title: 'Test programme' });
  const b = await Batch.create({ programId: p._id, name: 'Test cohort', studentIds: [] });
  batchId = b._id;
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('the bar is 45% of the scheduled class', async () => {
  const s = await makeSession();
  assert.equal(MIN_SHARE, 0.45);
  assert.equal(requiredMs(s), 54 * MIN); // 45% of two hours
});

test('stays past the bar → stays present', async () => {
  const s = await makeSession();
  const u = await makeStudent('stayer');
  await recordJoin(s, u._id, START);
  await recordLeave(s, u._id, START + 60 * MIN); // 60 of 120 minutes

  const r = await applyPresenceRule(s);
  assert.equal(r.demoted, 0);
  assert.equal((await statusOf(s, u)).status, 'present');
});

test('leaves before the bar → demoted to absent', async () => {
  const s = await makeSession();
  const u = await makeStudent('leaver');
  await recordJoin(s, u._id, START);
  await recordLeave(s, u._id, START + 20 * MIN); // 20 of 120

  assert.equal((await statusOf(s, u)).status, 'present', 'present while the class runs');
  const r = await applyPresenceRule(s);
  assert.equal(r.demoted, 1);
  assert.equal((await statusOf(s, u)).status, 'absent');
});

test('drops and rejoins → the stretches add up', async () => {
  const s = await makeSession();
  const u = await makeStudent('rejoiner');
  await recordJoin(s, u._id, START);
  await recordLeave(s, u._id, START + 30 * MIN); // 30
  await recordJoin(s, u._id, START + 40 * MIN);
  await recordLeave(s, u._id, START + 70 * MIN); // +30 = 60 total

  const row = await statusOf(s, u);
  assert.equal(row.attendedMs, 60 * MIN, 'both stretches counted, not just the last');
  await applyPresenceRule(s);
  assert.equal((await statusOf(s, u)).status, 'present');
});

test('two short visits that still fall short → absent', async () => {
  const s = await makeSession();
  const u = await makeStudent('dipper');
  await recordJoin(s, u._id, START);
  await recordLeave(s, u._id, START + 20 * MIN);
  await recordJoin(s, u._id, START + 60 * MIN);
  await recordLeave(s, u._id, START + 80 * MIN); // 40 total, bar is 54

  await applyPresenceRule(s);
  assert.equal((await statusOf(s, u)).status, 'absent');
});

test('never left → credited to the end of the class, not discarded', async () => {
  const s = await makeSession();
  const u = await makeStudent('stayed-to-end');
  await recordJoin(s, u._id, START + 10 * MIN); // no leave event ever arrives

  await applyPresenceRule(s);
  const row = await statusOf(s, u);
  assert.equal(row.status, 'present');
  assert.equal(row.attendedMs, TWO_HOURS - 10 * MIN, 'closed at the end of the class');
  assert.equal(row.openedAt, null);
});

test('time outside the class does not count toward the bar', async () => {
  const s = await makeSession();
  const u = await makeStudent('early-bird');
  // In the waiting room 30 minutes early, gone 30 minutes in: 30 real minutes.
  await recordJoin(s, u._id, START - 30 * MIN);
  await recordLeave(s, u._id, START + 30 * MIN);

  const row = await statusOf(s, u);
  assert.equal(row.attendedMs, 30 * MIN, 'the early half hour is not class time');
  await applyPresenceRule(s);
  assert.equal((await statusOf(s, u)).status, 'absent');
});

test("a mentor's register is never overruled", async () => {
  const s = await makeSession();
  const u = await makeStudent('mentor-vouched');
  await recordJoin(s, u._id, START);
  await recordLeave(s, u._id, START + 5 * MIN); // far under the bar
  await Attendance.updateOne(
    { sessionId: s._id, studentId: u._id },
    { $set: { status: 'present', markedBy: 'mentor' } },
  );

  const r = await applyPresenceRule(s);
  assert.equal(r.demoted, 0);
  assert.equal((await statusOf(s, u)).status, 'present');
});

test('a class with no end time is left alone — there is no length to take 45% of', async () => {
  const s = await makeSession({ ends: false });
  const u = await makeStudent('no-end-time');
  await recordJoin(s, u._id, START);
  await recordLeave(s, u._id, START + 60 * 1000);

  const r = await applyPresenceRule(s);
  assert.equal(r.reason, 'no end time');
  assert.equal(r.demoted, 0);
  assert.equal((await statusOf(s, u)).status, 'present');
});

test('a session Zoom never reported is left alone', async () => {
  // This is what every cohort looks like if the webhook is not configured.
  // Demoting here would mark a whole class absent for a lesson they sat through.
  const s = await makeSession();
  const u = await makeStudent('clicked-join-only');
  await Attendance.create({
    sessionId: s._id, studentId: u._id, batchId, status: 'present',
  });

  const r = await applyPresenceRule(s);
  assert.equal(r.reason, 'no presence data');
  assert.equal(r.demoted, 0);
  assert.equal((await statusOf(s, u)).status, 'present');
});

test('a record written before this feature existed is untouched', async () => {
  const s = await makeSession();
  const old = await makeStudent('legacy');
  const tracked = await makeStudent('tracked');
  // No attendedMs, no markedBy — exactly what the old code wrote.
  await Attendance.collection.insertOne({
    sessionId: s._id, studentId: old._id, batchId, status: 'present',
  });
  // Someone else in the same session does have presence data, so the rule runs.
  await recordJoin(s, tracked._id, START);
  await recordLeave(s, tracked._id, START + 90 * MIN);

  await applyPresenceRule(s);
  assert.equal((await statusOf(s, old)).status, 'present', 'legacy row survives');
  assert.equal((await statusOf(s, tracked)).status, 'present');
});

test('deploying cannot rewrite history: a full sweep over old classes changes nothing', async () => {
  // The exact shape of production on the day this ships. The sweep runs at
  // boot, so on deploy it walks every past class that was never swept — and
  // none of them can have presence data, because the webhook that produces it
  // was never live. Nothing here may be touched.
  const past = await Session.create({
    batchId,
    title: 'S00 · a class from before any of this',
    startsAt: new Date(START - 7 * 24 * HOUR),
    endsAt: new Date(START - 7 * 24 * HOUR + TWO_HOURS),
    zoomMeetingId: '86793830366',
    // Old enough that its join window has long closed, and never swept.
    absenceSweptAt: null,
  });
  const wasPresent = await makeStudent('history-present');
  const wasAbsent = await makeStudent('history-absent');

  // Written the way the old code wrote them: status only, no new fields.
  await Attendance.collection.insertMany([
    { sessionId: past._id, studentId: wasPresent._id, batchId, status: 'present' },
    { sessionId: past._id, studentId: wasAbsent._id, batchId, status: 'absent' },
  ]);

  const { sweepAbsences } = await import('../utils/attendanceSweep.js');
  const result = await sweepAbsences();

  assert.equal(result.demoted, 0, 'no historical record may be demoted on deploy');
  assert.equal(
    (await Attendance.findOne({ sessionId: past._id, studentId: wasPresent._id })).status,
    'present',
    'a present from before this feature stays present',
  );
  assert.equal(
    (await Attendance.findOne({ sessionId: past._id, studentId: wasAbsent._id })).status,
    'absent',
  );
});

test('running the rule twice changes nothing the second time', async () => {
  const s = await makeSession();
  const u = await makeStudent('idempotent');
  await recordJoin(s, u._id, START);
  await recordLeave(s, u._id, START + 10 * MIN);

  const first = await applyPresenceRule(s);
  const after = await statusOf(s, u);
  const second = await applyPresenceRule(s);

  assert.equal(first.demoted, 1);
  assert.equal(second.demoted, 0, 'already absent, nothing left to demote');
  assert.equal((await statusOf(s, u)).attendedMs, after.attendedMs);
});
