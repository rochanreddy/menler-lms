import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { joinWindow } from './sessionTime.js';

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

    await Session.updateOne({ _id: s._id }, { $set: { absenceSweptAt: new Date(now) } });
    swept += 1;
  }
  return { swept, marked };
}

// Every five minutes, plus once at boot so a server that slept through a class
// (a sleeping Render instance, a deploy) catches up as soon as it wakes.
export function startAbsenceSweep(everyMs = 5 * 60 * 1000) {
  const run = () => sweepAbsences()
    .then(({ swept, marked }) => { if (swept) console.log(`[attendance] swept ${swept} session(s), marked ${marked} absent`); })
    .catch((err) => console.error('[attendance] sweep failed:', err.message));
  run();
  const t = setInterval(run, everyMs);
  t.unref?.(); // never hold the process open on shutdown
  return t;
}
