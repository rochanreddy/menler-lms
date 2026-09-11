import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { joinWindow, sessionEnd } from './sessionTime.js';
import { overlapMs, requiredMs } from './attendanceRule.js';

/**
 * Settle the register against the 45% rule, once the class is over.
 *
 * Joining marks you present straight away and this is the only thing that ever
 * takes it back, so everything here is written to fail toward leaving the
 * register alone. It declines to act in three cases:
 *
 *  - the class has no end time, so there is no length to take 45% of;
 *  - the session has no Zoom presence data at all, which is what a cohort looks
 *    like when the webhook is not configured, is misconfigured, or Zoom simply
 *    never delivered. Demoting on that basis would mark a whole class absent
 *    for a lesson they sat through;
 *  - the row was saved by a mentor, who was in the room and outranks telemetry.
 *
 * A presence still open when the class ended is closed at the end rather than
 * discarded: no leave event means they were in the meeting when it finished.
 * That also means a cohort whose `participant_left` events never arrive is
 * credited from join to end — generous, and never wrongly absent.
 */
export async function applyPresenceRule(session) {
  const need = requiredMs(session);
  if (need === null) return { checked: 0, demoted: 0, reason: 'no end time' };

  const rows = await Attendance.find({ sessionId: session._id })
    .select('studentId status attendedMs openedAt markedBy');
  if (!rows.length) return { checked: 0, demoted: 0, reason: 'no records' };

  const sawZoom = rows.some((r) => (r.attendedMs || 0) > 0 || r.openedAt);
  if (!sawZoom) return { checked: rows.length, demoted: 0, reason: 'no presence data' };

  const end = sessionEnd(session);
  const writes = [];
  let demoted = 0;

  for (const r of rows) {
    // A mentor was in the room; their register outranks telemetry.
    if (r.markedBy === 'mentor') continue;

    // Judge only what was actually measured. A row Zoom never reported — one
    // written before this rule existed, or a Join click Zoom never confirmed —
    // has no presence to weigh, so there is no basis to take its present away.
    // Without this, one tracked student in a session was enough to demote
    // every untracked row alongside them.
    const tracked = r.markedBy === 'zoom' || (r.attendedMs || 0) > 0 || Boolean(r.openedAt);
    if (!tracked) continue;

    const open = r.openedAt ? overlapMs(session, r.openedAt.getTime(), end) : 0;
    const attended = (r.attendedMs || 0) + open;
    const short = attended < need;
    if (!open && !(short && r.status === 'present')) continue;

    const set = { attendedMs: attended, openedAt: null };
    if (short && r.status === 'present') {
      set.status = 'absent';
      demoted += 1;
    }
    writes.push({ updateOne: { filter: { _id: r._id }, update: { $set: set } } });
  }

  if (writes.length) await Attendance.bulkWrite(writes, { ordered: false });
  return { checked: rows.length, demoted, need };
}

// Marks the no-shows absent once a class is over.
//
// Attendance % is present ÷ records, and a record only existed when someone
// did something: the student clicked Join, Zoom reported them, or a mentor
// saved the register. A student who skipped every class and whose mentor never
// saved a register therefore had no records at all — and one Join click made
// them 1 of 1, 100%. After a session's join window closes, this writes
// `absent` for every enrolled student who has no record for it.
//
// It never overwrites: $setOnInsert only fills a gap, so a present from a
// click, from Zoom or from the register always survives, and a mentor can still
// flip an absent to present afterwards. Each session is swept once
// (`absenceSweptAt`), and every step is idempotent, so two server instances or
// a restart mid-sweep cannot double-count.
export async function sweepAbsences(now = Date.now()) {
  const candidates = await Session.find({ absenceSweptAt: null, startsAt: { $lt: new Date(now) } });
  let swept = 0;
  let marked = 0;
  let demoted = 0;

  for (const s of candidates) {
    const { closes } = joinWindow(s);
    if (closes > now) continue; // still joinable

    // A class entered into the LMS only after it had finished (back-filling a
    // cohort that started before scheduling moved in here) could not have been
    // joined through the LMS by anyone. Calling the whole batch absent for it
    // would be false; record its register by hand instead.
    const backfilled = s.createdAt && s.createdAt.getTime() > closes;

    if (!backfilled) {
      const batch = await Batch.findById(s.batchId).select('studentIds');
      if (batch?.studentIds?.length) {
        // Only students whose account existed when the class ran: someone
        // added a week later did not miss it. Account age stands in for
        // enrolment date, which the batch does not record.
        const students = await User.find({
          _id: { $in: batch.studentIds },
          role: 'student',
          createdAt: { $lte: s.startsAt },
        }).select('_id');
        if (students.length) {
          try {
            const r = await Attendance.bulkWrite(
              students.map((u) => ({
                updateOne: {
                  filter: { sessionId: s._id, studentId: u._id },
                  update: { $setOnInsert: { status: 'absent', batchId: s.batchId } },
                  upsert: true,
                },
              })),
              { ordered: false },
            );
            marked += r.upsertedCount || 0;
          } catch (err) {
            // A Join landing mid-sweep races the upsert on the unique
            // (session, student) index; that student is present, which is the
            // right answer, so a duplicate key is not a failure.
            if (!(err?.code === 11000 || (err?.writeErrors || []).every((w) => w.code === 11000))) throw err;
            marked += err?.result?.upsertedCount || 0;
          }
        }
      }
    }

    // Settle the 45% rule before the session is stamped swept, so the two
    // happen together and a restart between them cannot leave the register
    // half-finalised.
    try {
      const r = await applyPresenceRule(s);
      demoted += r.demoted;
    } catch (err) {
      // A failure here must not strand the session unswept — the no-shows above
      // are already written, and leaving `absenceSweptAt` null would replay
      // them every five minutes.
      console.error(`[attendance] presence rule failed for ${s._id}:`, err.message);
    }

    await Session.updateOne({ _id: s._id }, { $set: { absenceSweptAt: new Date(now) } });
    swept += 1;
  }
  return { swept, marked, demoted };
}

// Every five minutes, plus once at boot so a server that slept through a class
// (a sleeping Render instance, a deploy) catches up as soon as it wakes.
export function startAbsenceSweep(everyMs = 5 * 60 * 1000) {
  const run = () => sweepAbsences()
    .then(({ swept, marked, demoted }) => {
      if (swept) {
        console.log(
          `[attendance] swept ${swept} session(s), marked ${marked} absent`
          + `, demoted ${demoted} under the 45% bar`,
        );
      }
    })
    .catch((err) => console.error('[attendance] sweep failed:', err.message));
  run();
  const t = setInterval(run, everyMs);
  t.unref?.(); // never hold the process open on shutdown
  return t;
}
