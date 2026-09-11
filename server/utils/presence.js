// The bookkeeping behind the 45% rule: how time in a Zoom meeting is recorded.
//
// Lifted out of the webhook route so it can be tested without an HTTP request
// or a signed Zoom payload — the arithmetic here decides whether a real student
// keeps their attendance, and it is worth being able to prove it.

import { Attendance } from '../models/Attendance.js';
import { overlapMs } from './attendanceRule.js';

/**
 * A student appeared in the meeting.
 *
 * Marks present immediately, exactly as joining always has. The 45% rule only
 * ever takes this back later, in the sweep, once the class is over — so a class
 * in progress reads the way it always did, and a failure to collect leave
 * events can never turn into a false absence.
 */
export async function recordJoin(session, studentId, atMs) {
  await Attendance.updateOne(
    { sessionId: session._id, studentId },
    {
      $set: {
        status: 'present',
        batchId: session.batchId,
        markedBy: 'zoom',
        openedAt: new Date(atMs),
      },
    },
    { upsert: true },
  );
}

/**
 * A student left the meeting — close the interval their join opened.
 *
 * `fallbackJoinMs` is Zoom's own `join_time`, used when no open interval is on
 * record: the join webhook can arrive out of order, or leave events can be
 * switched on midway through a meeting, and Zoom reports the pair on the leave
 * either way.
 *
 * Returns the milliseconds credited, which is what the tests assert on.
 */
export async function recordLeave(session, studentId, leaveMs, fallbackJoinMs = null) {
  const key = { sessionId: session._id, studentId };
  const row = await Attendance.findOne(key).select('openedAt');
  const from = row?.openedAt ? row.openedAt.getTime() : fallbackJoinMs;
  const add = from ? overlapMs(session, from, leaveMs) : 0;

  await Attendance.updateOne(
    key,
    {
      // $inc, so a student who drops and rejoins has both stretches counted
      // rather than the second replacing the first.
      $inc: { attendedMs: add },
      $set: { openedAt: null, batchId: session.batchId },
      $setOnInsert: { status: 'present', markedBy: 'zoom' },
    },
    { upsert: true },
  );
  return add;
}
