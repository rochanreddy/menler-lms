import { Assignment } from '../models/Assignment.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { sendMail } from './email.js';
import { assignmentReminderEmail } from './emailTemplates.js';
import { canSendReminders } from './sessionReminders.js';

/**
 * The two assignment mails: one as the assignment opens, one 24 hours before
 * it is due. Every student in the batch gets both.
 *
 * Same machinery as the class reminders in sessionReminders.js — a one-minute
 * tick, bounded windows, and a stamp CLAIMED before the send, never after,
 * because mail is not idempotent and a duplicate is a second copy in forty
 * inboxes. See that file for the reasoning; what follows is what differs.
 */

// When "opens" is. An assignment opens at its startDate; with none it is open
// from the moment it exists, so createdAt stands in.
//
// But only for an assignment someone has DATED. scripts/syncCurriculumAssignments.js
// creates a programme's whole set at once with no dates — Generalist is ten,
// Kickstarter twenty-one — and treating each of those as "opened now" would
// send every student twenty mails in a minute. An assignment with neither a
// start nor a due date is a placeholder, and placeholders are not announced.
const openAt = (a) => new Date(a.startDate || a.createdAt).getTime();
const isDated = (a) => Boolean(a.startDate || a.dueDate);

// How late an open mail may still go out. Long enough to ride out a deploy;
// short enough that a server down all afternoon does not wake up announcing
// assignments that have been sitting on the Learning tab for hours.
export const OPEN_GRACE_MS = 30 * 60 * 1000;

// The due reminder goes 24 hours before the cutoff. The slack is how late it
// may still go — "due in 24 hours" is still honest at 23h30, and a deploy
// that lands on the exact minute should not cost the cohort its reminder.
export const DUE_LEAD_MS = 24 * 60 * 60 * 1000;
export const DUE_SLACK_MS = 30 * 60 * 1000;

/** Is the open mail due for this assignment, as of `now`? */
export function openMailDue(a, now = Date.now()) {
  if (a.openMailedAt) return false;
  if (!isDated(a)) return false;
  // Opened already past its own deadline: announcing it would only be a
  // message about something the student can no longer do.
  if (a.dueDate && new Date(a.dueDate).getTime() <= now) return false;
  const at = openAt(a);
  return at > now - OPEN_GRACE_MS && at <= now;
}

/** Is the 24-hour reminder due for this assignment, as of `now`? */
export function dueReminderDue(a, now = Date.now()) {
  if (!a.dueDate) return false;
  const due = new Date(a.dueDate).getTime();
  // Already reminded about THIS date. A reminder for an earlier date — before
  // an extension — does not count.
  if (a.dueReminderFor && new Date(a.dueReminderFor).getTime() === due) return false;
  return due > now + DUE_LEAD_MS - DUE_SLACK_MS && due <= now + DUE_LEAD_MS;
}

/**
 * The Mongo filters that fetch the candidates. Deliberately the same bounds as
 * the predicates above, and the predicates are applied again to what comes
 * back: the query keeps the fetch small, the predicate is the rule.
 */
export function assignmentWindows(now = Date.now()) {
  const openFrom = new Date(now - OPEN_GRACE_MS);
  const openTo = new Date(now);
  return {
    open: {
      openMailedAt: null,
      $or: [
        { startDate: { $gt: openFrom, $lte: openTo } },
        { startDate: null, dueDate: { $ne: null }, createdAt: { $gt: openFrom, $lte: openTo } },
      ],
    },
    due: {
      dueDate: { $gt: new Date(now + DUE_LEAD_MS - DUE_SLACK_MS), $lte: new Date(now + DUE_LEAD_MS) },
      $expr: { $ne: ['$dueReminderFor', '$dueDate'] },
    },
  };
}

// Between sends, as in the class reminders — a well-behaved client, not a
// provider limit.
const GAP_MS = 400;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function mailBatch(a, kind) {
  const batch = await Batch.findById(a.batchId).select('studentIds name');
  if (!batch?.studentIds?.length) return { sent: 0, failed: 0 };
  const students = await User.find({ _id: { $in: batch.studentIds }, role: 'student' })
    .select('fullName name email').lean();

  let sent = 0;
  let failed = 0;
  for (const s of students) {
    if (!s.email) continue;
    const msg = assignmentReminderEmail({
      fullName: s.fullName || s.name || '',
      email: s.email,
      title: a.title,
      type: a.type,
      batchName: batch.name || '',
      startDate: a.startDate,
      dueDate: a.dueDate,
      kind,
    });
    try {
      await sendMail({ to: s.email, subject: msg.subject, text: msg.text, html: msg.html });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[assignments] ${kind} to ${s.email} failed:`, err?.message || err);
    }
    if (GAP_MS) await sleep(GAP_MS);
  }
  return { sent, failed };
}

export async function sweepAssignmentReminders(now = Date.now()) {
  if (!canSendReminders()) return { opened: 0, due: 0, sent: 0, failed: 0, skipped: 'no cohort-capable mail transport' };
  const w = assignmentWindows(now);
  let opened = 0;
  let due = 0;
  let sent = 0;
  let failed = 0;

  for (const a of await Assignment.find(w.open)) {
    if (!openMailDue(a, now)) continue;
    const won = await Assignment.findOneAndUpdate(
      { _id: a._id, openMailedAt: null },
      { $set: { openMailedAt: new Date(now) } },
      { projection: { _id: 1 } },
    );
    if (!won) continue;
    const r = await mailBatch(a, 'open');
    opened += 1; sent += r.sent; failed += r.failed;
  }

  for (const a of await Assignment.find(w.due)) {
    if (!dueReminderDue(a, now)) continue;
    // The due date is part of the claim, so an edit that moved it between the
    // find and here makes this claim miss rather than remind about a date
    // that no longer exists.
    const won = await Assignment.findOneAndUpdate(
      { _id: a._id, dueDate: a.dueDate, $expr: { $ne: ['$dueReminderFor', '$dueDate'] } },
      { $set: { dueReminderFor: a.dueDate } },
      { projection: { _id: 1 } },
    );
    if (!won) continue;
    const r = await mailBatch(a, 'due');
    due += 1; sent += r.sent; failed += r.failed;
  }

  return { opened, due, sent, failed };
}

/** Every minute, no boot run — see startSessionReminders for why. */
export function startAssignmentReminders(everyMs = 60 * 1000) {
  if (!canSendReminders()) return null; // sessionReminders already says so at boot
  const run = () => sweepAssignmentReminders()
    .then(({ opened, due, sent, failed }) => {
      if (opened || due) {
        console.log(`[assignments] ${opened} opened + ${due} due-tomorrow, ${sent} mailed${failed ? `, ${failed} failed` : ''}`);
      }
    })
    .catch((err) => console.error('[assignments] sweep failed:', err.message));
  const t = setInterval(run, everyMs);
  t.unref?.();
  return t;
}
