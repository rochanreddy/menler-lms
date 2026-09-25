import { DoubtSession } from '../models/DoubtSession.js';
import { DoubtBooking } from '../models/DoubtBooking.js';
import { dropAttachments } from './doubtAttachments.js';

// A doubt attachment lives for one evening. This is what ends it.
//
// The promise made on the student's page is that what they attach is gone once
// the session is over, so it has to be kept by something that runs whether or
// not an admin remembers — the same reasoning as the absence sweep. Cancelling
// a session and giving a slot back drop their files on the spot (see
// routes/doubtSessions.js); this catches every session that simply finished.
//
// Not `bookingsClosedAt`. Closing booking freezes the sheet while the evening
// is still ahead, which is exactly when the mentor is reading these files to
// prepare — deleting them there would take the screenshots away an hour before
// the call they were attached for.

// The grid says a 9:30 slot ends at 10:00, and a session that runs twenty
// minutes over is a normal evening, not an exception. The grace is what keeps
// the sweep from pulling a screenshot off the screen mid-call.
export const SWEEP_GRACE_MS = 2 * 60 * 60 * 1000;

const endOf = (session) => {
  if (!session?.slotsAt?.length) return null;
  const last = session.slotsAt[session.slotsAt.length - 1];
  return new Date(last).getTime() + (session.slotMinutes || 30) * 60000;
};

/**
 * Has this session's evening finished long enough ago for its attachments to
 * go? Exported because it is the whole rule, and getting it wrong is invisible
 * either way: too eager pulls a screenshot off the mentor's screen during the
 * call, too lax quietly keeps files the student was promised would be deleted.
 *
 * A missing session is expired — the booking has nothing left to belong to.
 * A session with no slots has no end to measure from, so it is left alone
 * rather than guessed at.
 */
export function attachmentsExpired(session, now = Date.now()) {
  if (!session) return true;
  const end = endOf(session);
  if (end === null) return false;
  return end + SWEEP_GRACE_MS <= now;
}

/**
 * Delete the attachments of every doubt session that has finished.
 *
 * Driven from the bookings rather than from the sessions: only a booking that
 * still holds files is work, and once its list is cleared it stops matching,
 * so this needs no swept-at stamp to stay idempotent. It also means the query
 * is bounded by how many people attached something recently, not by how many
 * doubt sessions the course has ever run.
 */
export async function sweepDoubtAttachments(now = Date.now()) {
  const rows = await DoubtBooking.find({ 'attachments.0': { $exists: true } })
    .select('sessionId attachments');
  if (!rows.length) return { sessions: 0, bookings: 0, files: 0 };

  const sessions = await DoubtSession.find({ _id: { $in: rows.map((r) => r.sessionId) } })
    .select('slotsAt slotMinutes cancelledAt');
  const byId = new Map(sessions.map((s) => [String(s._id), s]));

  const done = new Set();
  let bookings = 0;
  let files = 0;

  for (const row of rows) {
    if (!attachmentsExpired(byId.get(String(row.sessionId)), now)) continue;

    files += await dropAttachments(row.attachments);
    await DoubtBooking.updateOne({ _id: row._id }, { $set: { attachments: [] } });
    bookings += 1;
    done.add(String(row.sessionId));
  }

  return { sessions: done.size, bookings, files };
}

// Every fifteen minutes, plus once at boot so an instance that slept through
// the end of a session (a sleeping Render instance, a deploy) clears up as
// soon as it wakes rather than at the next tick.
export function startDoubtAttachmentSweep(everyMs = 15 * 60 * 1000) {
  const run = () => sweepDoubtAttachments()
    .then(({ sessions, bookings, files }) => {
      if (bookings) {
        console.log(`[doubts] cleared ${files} attachment(s) from ${bookings} booking(s) across ${sessions} finished session(s)`);
      }
    })
    .catch((err) => console.error('[doubts] attachment sweep failed:', err.message));
  run();
  const t = setInterval(run, everyMs);
  t.unref?.(); // never hold the process open on shutdown
  return t;
}
