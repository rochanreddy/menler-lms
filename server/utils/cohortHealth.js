import { Batch } from '../models/Batch.js';
import { Session } from '../models/Session.js';
import { Attendance } from '../models/Attendance.js';
import { ClassReview } from '../models/ClassReview.js';
import { Program } from '../models/Program.js';
import { Progress } from '../models/Progress.js';
import { Doubt } from '../models/Doubt.js';
import { User } from '../models/User.js';
import { Counter } from '../models/Counter.js';
import { isMailConfigured, sendMail } from './email.js';
import { cohortHealthEmail } from './emailTemplates.js';

/**
 * The weekly cohort health report: one mail to the team lead every Monday
 * morning, one block per ongoing batch — attendance this week against last,
 * class ratings, lesson completion, who has gone quiet, and how many of the
 * week's doubts a mentor answered.
 *
 * Every number is one the admin Home already shows ("gone quiet" is its rule:
 * no visit to the LMS in QUIET_DAYS), gathered into a mail so nobody has to
 * open the dashboard on a Monday to see whether a cohort is slipping.
 */

const DAY = 24 * 60 * 60 * 1000;
export const WEEK = 7 * DAY;

// Monday, 09:00 IST. A server that was down at nine still sends later that
// Monday; one that is down all Monday skips the week rather than sending
// "last week" on a Wednesday.
const SEND_DAY = 1; // Monday
const SEND_HOUR = 9;

// The admin Home's "gone quiet": has not opened the LMS in a week.
export const QUIET_DAYS = 7;

/** The IST calendar date and hour of an instant. */
function istParts(now) {
  const ist = new Date(now + 5.5 * 60 * 60 * 1000); // IST has no DST
  return { key: ist.toISOString().slice(0, 10), day: ist.getUTCDay(), hour: ist.getUTCHours() };
}

/**
 * The week's claim key, e.g. "cohort-health:2026-10-26", or null when `now` is
 * not inside the send window. The key is the Monday itself, so however many
 * ticks land in the window, only one of them can claim it.
 */
export function reportKeyFor(now = Date.now()) {
  const { key, day, hour } = istParts(now);
  if (day !== SEND_DAY || hour < SEND_HOUR) return null;
  return `cohort-health:${key}`;
}

const pct = (part, total) => (total ? Math.round((part / total) * 100) : null);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((n, x) => n + x, 0) / xs.length) * 10) / 10 : null);

/** The numbers for every ongoing batch, for the 7 days ending at `now`. */
export async function buildCohortHealth(now = Date.now()) {
  const from = new Date(now - WEEK);
  const prevFrom = new Date(now - 2 * WEEK);
  const to = new Date(now);

  const batches = await Batch.find({ status: 'ongoing' }).select('name programId studentIds').sort({ name: 1 }).lean();
  const batchIds = batches.map((b) => b._id);
  if (!batchIds.length) return { from, to, batches: [] };

  const programIds = [...new Set(batches.map((b) => String(b.programId)).filter(Boolean))];
  const sessions = await Session.find({ batchId: { $in: batchIds }, startsAt: { $gte: prevFrom, $lt: to } })
    .select('batchId startsAt').lean();
  const sessionIds = sessions.map((s) => s._id);

  const [attendance, reviews, programs, progress, doubts, students] = await Promise.all([
    Attendance.find({ sessionId: { $in: sessionIds } }).select('sessionId status').lean(),
    ClassReview.find({ sessionId: { $in: sessionIds } }).select('sessionId overall').lean(),
    Program.find({ _id: { $in: programIds } }).select('modules').lean(),
    Progress.find({ programId: { $in: programIds } }).select('studentId programId completedTopics').lean(),
    Doubt.find({ batchId: { $in: batchIds }, kind: 'doubt', createdAt: { $gte: from, $lt: to } })
      .select('batchId authorId comments.authorId').lean(),
    User.find({ _id: { $in: batches.flatMap((b) => b.studentIds) }, role: 'student' }).select('fullName email lastActiveAt').lean(),
  ]);

  // A doubt counts as answered once a mentor or admin has replied to it — a
  // classmate's "same here" is not an answer.
  const replierIds = [...new Set(doubts.flatMap((d) => (d.comments || []).map((c) => String(c.authorId))))];
  const staff = new Set((await User.find({ _id: { $in: replierIds }, role: { $in: ['mentor', 'admin'] } }).select('_id').lean())
    .map((u) => String(u._id)));

  const sessionById = new Map(sessions.map((s) => [String(s._id), s]));
  const thisWeek = (s) => s.startsAt >= from;
  const lessonTotal = new Map(programs.map((p) => [
    String(p._id),
    (p.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0),
  ]));
  const studentById = new Map(students.map((u) => [String(u._id), u]));
  const daysAway = (u) => Math.floor((now - new Date(u.lastActiveAt).getTime()) / DAY);
  const doneBy = new Map(progress.map((p) => [`${p.studentId}:${p.programId}`, (p.completedTopics || []).length]));

  const rows = batches.map((b) => {
    const bid = String(b._id);
    const pid = String(b.programId);
    const mine = (row) => String(sessionById.get(String(row.sessionId))?.batchId) === bid;
    const inWeek = (row, current) => thisWeek(sessionById.get(String(row.sessionId))) === current;

    const att = (current) => {
      const marked = attendance.filter((a) => mine(a) && inWeek(a, current));
      return pct(marked.filter((a) => a.status === 'present').length, marked.length);
    };
    const rating = (current) => reviews.filter((r) => mine(r) && inWeek(r, current)).map((r) => r.overall);

    const total = lessonTotal.get(pid) || 0;
    const completion = total && b.studentIds.length
      ? Math.round(b.studentIds.reduce((n, sid) => n + Math.min(doneBy.get(`${sid}:${pid}`) || 0, total) / total, 0)
        / b.studentIds.length * 100)
      : null;

    const enrolled = b.studentIds.map((sid) => studentById.get(String(sid))).filter(Boolean);
    const quiet = enrolled.filter((u) => u.lastActiveAt && daysAway(u) >= QUIET_DAYS).sort((x, y) => daysAway(y) - daysAway(x));
    const asked = doubts.filter((d) => String(d.batchId) === bid);
    const answered = asked.filter((d) => (d.comments || []).some((c) => staff.has(String(c.authorId)))).length;
    const ratingsNow = rating(true);

    return {
      id: bid,
      name: b.name,
      students: b.studentIds.length,
      classes: sessions.filter((s) => String(s.batchId) === bid && thisWeek(s)).length,
      attendance: att(true),
      attendanceLastWeek: att(false),
      rating: avg(ratingsNow),
      ratingCount: ratingsNow.length,
      ratingLastWeek: avg(rating(false)),
      completion,
      quiet: quiet.length,
      quietNames: quiet.slice(0, 5).map((u) => u.fullName || u.email),
      neverOpened: enrolled.filter((u) => !u.lastActiveAt).length,
      doubtsAsked: asked.length,
      doubtsAnswered: answered,
    };
  });

  return { from, to, batches: rows };
}

/**
 * Who gets it: COHORT_REPORT_TO (comma-separated) when set, otherwise every
 * admin account — the team lead is an admin, and a report nobody configured is
 * better landing with the admins than nowhere.
 */
export async function reportRecipients() {
  const listed = String(process.env.COHORT_REPORT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (listed.length) return listed;
  return (await User.find({ role: 'admin' }).select('email').lean()).map((u) => u.email).filter(Boolean);
}

/** Build and send the report now. Returns who it went to. */
export async function sendCohortHealth(now = Date.now()) {
  const to = await reportRecipients();
  if (!to.length) return { to, sent: 0, failed: 0 };
  const msg = cohortHealthEmail(await buildCohortHealth(now));
  let sent = 0;
  let failed = 0;
  for (const addr of to) {
    try {
      await sendMail({ to: addr, subject: msg.subject, text: msg.text, html: msg.html });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[cohort-health] to ${addr} failed:`, err?.message || err);
    }
  }
  return { to, sent, failed };
}

/**
 * One tick: if it is Monday morning and this week's report has not gone, claim
 * the week and send. The claim is taken BEFORE the send, as with the class
 * reminders — two instances on the same tick must not both mail the team lead.
 * If nobody was reached the claim is given back so the next tick tries again.
 */
export async function sweepCohortHealth(now = Date.now()) {
  const key = reportKeyFor(now);
  if (!key) return null;
  const claim = await Counter.findOneAndUpdate(
    { _id: key },
    { $setOnInsert: { seq: 1 } },
    { upsert: true, new: false },
  );
  if (claim) return null; // already sent (or being sent) this week
  const r = await sendCohortHealth(now);
  if (!r.sent) await Counter.deleteOne({ _id: key });
  return r;
}

/** Every 15 minutes, no boot run. */
export function startCohortHealth(everyMs = 15 * 60 * 1000) {
  if (!isMailConfigured()) return null;
  const run = () => sweepCohortHealth()
    .then((r) => {
      if (r) console.log(`[cohort-health] weekly report to ${r.to.length} recipient(s), ${r.sent} sent${r.failed ? `, ${r.failed} failed` : ''}`);
    })
    .catch((err) => console.error('[cohort-health] sweep failed:', err.message));
  const t = setInterval(run, everyMs);
  t.unref?.();
  return t;
}
