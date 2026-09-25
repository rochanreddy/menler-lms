import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import {
  sendMail, isZeptoConfigured, isResendConfigured, isSmtpConfigured,
} from './email.js';
import { sessionReminderEmail } from './emailTemplates.js';

/**
 * The two class reminders: one an hour before, one as the class starts.
 *
 * The shape is the absence sweep's — a tick, a window, a stamp — but the
 * failure mode is the opposite way round, and that changes every decision
 * here. The sweep writes idempotent upserts, so replaying it is free. Mail is
 * not idempotent: replaying it puts a second copy in a student's inbox, and a
 * cohort that gets told twice that class is starting learns to ignore both.
 *
 * So the stamp is CLAIMED before the send, atomically, and never written
 * afterwards. A crash between the claim and the send costs one missed
 * reminder. The other way round costs a duplicate blast to the whole batch on
 * every restart, which is worse and much more visible.
 */

// How early the first mail goes out, and how wide a net each tick casts.
//
// The window is not a single instant because the tick is discrete: a class at
// 19:00 is an hour away at 18:00, and the tick that lands at 18:00:30 has to
// still recognise it.
//
// LEAD_SLACK is much wider than one tick on purpose. Ticks stop during a
// deploy, and a window only a tick or two wide would let a two-minute restart
// land squarely on a class's one chance at an hour-before mail and drop it
// silently. Fifteen minutes means a missed tick makes the mail LATE rather
// than absent — it goes out at 45 minutes instead of 60, which "starts in
// about an hour" still covers honestly, and the exact time is printed in the
// mail either way. Late beats never for a reminder.
export const LEAD_MS = 60 * 60 * 1000;
const LEAD_SLACK_MS = 15 * 60 * 1000;

// How late a reminder is still worth sending.
//
// This is what stops a server that was down for three hours from waking up and
// telling everyone their finished class starts in an hour. The hour-before
// mail is useless once the class has begun — by then the "starting now" mail
// is the true one — so it is not sent late at all. The starting-now mail is
// allowed a few minutes of lateness, because a mail that lands four minutes
// into a two-hour class is still worth having.
const START_GRACE_MS = 10 * 60 * 1000;

// Between sends, so a 40-student batch does not arrive at the provider as a
// 40-request burst. ZeptoMail and Resend both take this comfortably; the pause
// exists to stay a well-behaved client, not because either has refused.
const GAP_MS = 400;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Is there a transport that can take a whole cohort at once?
 *
 * Not the same question as "is mail configured". Every other mail this server
 * sends goes to ONE person because an admin pressed a button; a reminder goes
 * to forty because a clock ticked, and it does that twice a class, every class.
 *
 * Resend's free tier is 100 mails a day — about one evening cohort. A sweep
 * that starts a class's reminders and runs out of quota partway through
 * delivers to an arbitrary half of the room, which is worse than delivering to
 * none: nobody, mentor included, can tell who was told. And it would spend the
 * quota the account mails rely on. So reminders refuse to ride on it unless
 * someone says explicitly that the account is on a paid plan.
 *
 * ZeptoMail is credit-based with no daily wall, which is the whole reason the
 * mailer learned it. SMTP has no such cap either — on Render it cannot connect
 * at all, so this only ever says yes to it on a host that allows it.
 */
export function canSendReminders() {
  if (isZeptoConfigured()) return true;
  if (isResendConfigured()) return process.env.REMINDERS_ALLOW_RESEND === '1';
  return isSmtpConfigured();
}

/** Everyone who should be told about this class, with their name and address. */
async function audienceFor(session) {
  const batch = await Batch.findById(session.batchId).select('studentIds name');
  if (!batch?.studentIds?.length) return { batch: null, students: [] };

  // Only students enrolled before the class was scheduled to run. Someone
  // added to the batch tomorrow has no business being reminded about tonight,
  // and account age is what the batch records — it keeps no enrolment date.
  // Same stand-in the absence sweep uses, for the same reason.
  const students = await User.find({
    _id: { $in: batch.studentIds },
    role: 'student',
    createdAt: { $lte: session.startsAt },
  }).select('_id fullName name email').lean();

  return { batch, students };
}

/**
 * Claim one reminder for one session, atomically.
 *
 * Returns true only for the caller that won. `findOneAndUpdate` on a field
 * that is still null is a compare-and-set: two server instances ticking at the
 * same second, or one instance restarting mid-sweep, produce exactly one
 * winner and the loser walks away.
 */
async function claim(sessionId, field) {
  const won = await Session.findOneAndUpdate(
    { _id: sessionId, [field]: null },
    { $set: { [field]: new Date() } },
    { projection: { _id: 1 } },
  );
  return Boolean(won);
}

/** Mail one reminder to one cohort. Assumes the claim is already held. */
async function mailCohort(session, kind) {
  const { batch, students } = await audienceFor(session);
  if (!students.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const student of students) {
    if (!student.email) continue;
    const msg = sessionReminderEmail({
      fullName: student.fullName || student.name || '',
      email: student.email,
      title: session.title,
      batchName: batch?.name || '',
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      joinUrl: session.joinUrl || '',
      when: kind,
    });
    try {
      // A cohort per class: ZeptoMail, by name. Admin mail goes on Resend.
      await sendMail({ to: student.email, subject: msg.subject, text: msg.text, html: msg.html, via: 'zeptomail' });
      sent += 1;
    } catch (err) {
      // One bad address must not strand the rest of the batch. The claim is
      // already held, so this student simply misses this reminder.
      failed += 1;
      console.error(`[reminders] ${kind} to ${student.email} failed:`, err?.message || err);
    }
    if (GAP_MS) await sleep(GAP_MS);
  }
  return { sent, failed };
}

/**
 * Which classes are due which reminder, as of `now`.
 *
 * Split out and exported so the arithmetic can be proved without a database —
 * it is the part of this file most likely to be wrong, and the part whose
 * being wrong is least visible (a window off by a minute does not throw, it
 * just quietly never mails anyone, or mails about a class that finished).
 *
 * Both windows are half-open — exclusive at the early bound, inclusive at the
 * late one — so a class sitting exactly on a boundary belongs to exactly one
 * tick and cannot fall between two. Both also refuse to look further back than
 * their grace allows, which is what makes the first tick after downtime a
 * catch-up rather than a mailshot about classes that already happened.
 */
export function reminderWindows(now = Date.now()) {
  return {
    hour: {
      remindedHourAt: null,
      startsAt: { $gt: new Date(now + LEAD_MS - LEAD_SLACK_MS), $lte: new Date(now + LEAD_MS) },
    },
    start: {
      remindedStartAt: null,
      startsAt: { $gt: new Date(now - START_GRACE_MS), $lte: new Date(now) },
    },
  };
}

/**
 * One pass. Finds the classes due a reminder, claims each, and sends.
 */
export async function sweepReminders(now = Date.now()) {
  if (!canSendReminders()) {
    return { hour: 0, start: 0, sent: 0, failed: 0, skipped: 'no cohort-capable mail transport' };
  }

  let hour = 0;
  let start = 0;
  let sent = 0;
  let failed = 0;
  const windows = reminderWindows(now);

  // ── an hour out ──
  // Due between now+45m and now+60m, and never sent after the fact.
  const hourDue = await Session.find(windows.hour);
  for (const s of hourDue) {
    if (!await claim(s._id, 'remindedHourAt')) continue;
    const r = await mailCohort(s, 'hour');
    hour += 1; sent += r.sent; failed += r.failed;
  }

  // ── starting now ──
  // Due from the start time until START_GRACE_MS after it. A class scheduled
  // in the past — back-filled by an admin recording a cohort that ran before
  // it moved into the LMS — is already outside this window, so nobody is told
  // to join a class that finished last week.
  const startDue = await Session.find(windows.start);
  for (const s of startDue) {
    if (!await claim(s._id, 'remindedStartAt')) continue;
    const r = await mailCohort(s, 'start');
    start += 1; sent += r.sent; failed += r.failed;
  }

  return { hour, start, sent, failed };
}

/**
 * Every minute.
 *
 * A minute rather than the absence sweep's five because "when the session
 * starts" means it: on a five-minute tick the starting-now mail lands up to
 * five minutes into the class, which is exactly when it stops being useful.
 * The query is a range seek on the `startsAt` index over a four-minute window,
 * so a tick that finds nothing — almost all of them — costs a single indexed
 * lookup returning nothing.
 *
 * There is deliberately NO run at boot. The absence sweep has one so a server
 * that slept through a class still settles the register; reminders are the
 * opposite — a deploy that restarts the API mid-class must not mail anyone,
 * and the windows above already refuse anything stale. The first tick a minute
 * from now catches everything that is still genuinely due.
 */
export function startSessionReminders(everyMs = 60 * 1000) {
  // Said once, loudly, at boot. Reminders that silently never send look
  // exactly like reminders that are working until a student misses a class —
  // so the one line in the deploy log that explains why is worth more than the
  // tick it saves.
  if (!canSendReminders()) {
    console.warn('[reminders] OFF — no cohort-capable mail transport. Set ZEPTOMAIL_TOKEN'
      + ' (or REMINDERS_ALLOW_RESEND=1 if Resend is on a paid plan).');
    return null;
  }
  const run = () => sweepReminders()
    .then(({ hour, start, sent, failed }) => {
      if (hour || start) {
        console.log(
          `[reminders] ${hour} hour-before + ${start} starting-now class(es)`
          + `, ${sent} mailed${failed ? `, ${failed} failed` : ''}`,
        );
      }
    })
    .catch((err) => console.error('[reminders] sweep failed:', err.message));
  const t = setInterval(run, everyMs);
  t.unref?.(); // never hold the process open on shutdown
  return t;
}
