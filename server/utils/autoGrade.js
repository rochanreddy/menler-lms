import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
// Registered here because the grader populates through them; the server's
// routes register them too, but this module must not depend on that.
import '../models/Assignment.js';
import '../models/Batch.js';
import '../models/Program.js';
import { notify, notifyMany } from './notify.js';
import { collectSubmissionContent } from './submissionContent.js';
import { reviewSubmission, AI_GRADE_MODEL } from './aiGrade.js';

// Assignments are graded by the AI, end to end.
//
// Fifteen minutes after a hand-in passes the Drive check, the rubric review in
// utils/aiGrade.js runs and its result IS the grade: score out of 10, feedback
// to the student, submission locked — exactly what a mentor pressing Grade
// does. The student is told, and so is every admin, with the student, the
// batch and the score, so the desk can see grading happening without opening
// every batch. A mentor can still regrade by hand, and that wins.
//
// Why wait. A grade landing seconds after the upload reads as a machine
// skimming the folder, and the first minutes after a hand-in are when students
// notice the missing file and fix it. Editing the submission restarts the
// clock (submittedAt), so the grade is of what they meant to hand in.
//
// Same machinery as the other sweeps: a one-minute tick, and each submission
// CLAIMED with one atomic update before the model is called, so two instances
// or two overlapping ticks cannot grade the same work twice.

const MIN = 60 * 1000;

export const AUTO_GRADE_DELAY_MS = (Number(process.env.AUTO_GRADE_DELAY_MIN) || 15) * MIN;

// Real work is never graded below average. A submission that passed the Drive
// check and is not empty or the brief pasted back gets at least this; strong
// work scores on the rubric as it stands.
export const AUTO_GRADE_FLOOR = Number(process.env.AUTO_GRADE_FLOOR) || 5;

// A review that fails this many times on one hand-in stops being retried and
// is handed to the admins to grade by hand.
export const MAX_ATTEMPTS = 3;

// A review still "running" this long after it was claimed died with its
// process (a deploy, a crash) and may be claimed again.
export const STALE_RUN_MS = 15 * MIN;

// Reviews per tick. Each one is a model call of a few seconds to half a
// minute; a handful a minute keeps a burst of hand-ins off the rate limit.
const PER_TICK = 5;

// A permanent failure: retrying cannot help, so it goes to the admins at once.
export class NothingToReview extends Error {}

/**
 * Run the rubric review over one submission. `sub.assignmentId` must be
 * populated with title, description, type, rubricClass, deliverables, taught,
 * and batchId → programId → title. Returns what is stored on sub.aiReview
 * (minus the bookkeeping fields). Shared by the mentor's "Run AI review"
 * button and the automatic grader so the two cannot drift apart.
 */
export async function performReview(sub) {
  const assignment = sub.assignmentId;

  // Class D is the creative work: its images are the deliverable and are
  // judged on craft, everywhere else an image is a screenshot proving a
  // thing ran. Nothing about the file says which, so the rubric class does.
  const manifest = await collectSubmissionContent(sub, { creative: assignment.rubricClass === 'D' });

  // Video is listed for the mentor and never sent to a model, so a folder
  // holding only a Loom has nothing in it this review can read.
  const readable = manifest.items.filter((it) => it.kind !== 'video' && !it.unreadable);
  if (!readable.length) {
    throw new NothingToReview('Nothing readable was found in this submission. Documents, Claude Artifacts, PDFs and screenshots are reviewed; video is left for you to watch.');
  }

  // Everyone else on THIS assignment already reviewed, for the duplicate
  // check. Only their stored fingerprint is loaded, never their text.
  const peers = (await Submission.find({
    assignmentId: assignment._id,
    _id: { $ne: sub._id },
    isDeleted: false,
    'aiReview.fingerprint': { $ne: null },
  }).select('studentId aiReview.fingerprint').populate('studentId', 'fullName').limit(200))
    .map((p) => ({ studentName: p.studentId?.fullName || 'another student', fingerprint: p.aiReview?.fingerprint }))
    .filter((p) => p.fingerprint);

  const { fingerprint, ...final } = await reviewSubmission({
    manifest,
    peers,
    assignmentTitle: assignment.title,
    assignmentType: assignment.type,
    programName: assignment.batchId?.programId?.title || 'Menler',
    rubricClass: assignment.rubricClass,
    brief: assignment.description,
    deliverables: assignment.deliverables,
    taught: assignment.taught,
  });

  return { status: 'done', final, fingerprint, writeup: null, screenshots: null, model: AI_GRADE_MODEL, error: null, reviewedAt: new Date() };
}

// The two flags that mean there is no real work here to be generous to.
const NOT_REAL_WORK = /insufficient content|copied brief/i;

/**
 * The rubric's 0-100 as a grade out of 10, the scale every grade in the LMS
 * uses. Same mapping as the mentor's "use this" button in AiReview.jsx.
 * Floored at AUTO_GRADE_FLOOR unless the review found no real work.
 */
export function tenPointScore(final, floor = AUTO_GRADE_FLOOR) {
  const raw = Math.min(10, Math.max(1, Math.round((Number(final?.weighted_score) || 0) / 10)));
  const notRealWork = (final?.red_flags || []).some((f) => NOT_REAL_WORK.test(f?.flag || ''));
  return notRealWork ? raw : Math.max(raw, floor);
}

// What a sentence about the write-up rather than the work looks like. The
// prompt already forbids these; this is the backstop for when it slips.
const STYLE_TERMS = /\b(documentation|documented|format(?:ting|ted)?|fonts?|typography|headings?|headers?|bullet(?:ed)?(?: points?)?|layout|grammar|grammatical|spelling|typos?|punctuation|proofread\w*|writing style|tone|readability|well[- ]organi[sz]ed|presentation style)\b/gi;

/**
 * Drop every sentence of the student's feedback that comments on style rather
 * than on the assignment. A term the brief or the deliverables themselves use
 * is fair game: "your documentation" is a remark about substance when the
 * deliverable IS documentation.
 */
export function assignmentOnly(text, { brief = '', deliverables = [] } = {}) {
  if (!text) return '';
  const asked = `${brief} ${(deliverables || []).join(' ')}`.toLowerCase();
  const sentences = String(text).trim().split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => {
    const hits = s.match(STYLE_TERMS) || [];
    return hits.every((h) => asked.includes(h.toLowerCase()));
  });
  if (kept.length) return kept.join(' ');
  return 'Your submission has been reviewed against the brief for this assignment.';
}

/** The Mongo filter for submissions the grader may claim as of `now`. */
export function autoGradeFilter(now = Date.now()) {
  return {
    isDeleted: false,
    status: 'submitted',
    locked: false,
    checkStatus: 'READY',
    submittedAt: { $ne: null, $lte: new Date(now - AUTO_GRADE_DELAY_MS) },
    'aiReview.attempts': { $not: { $gte: MAX_ATTEMPTS } },
    $or: [
      { 'aiReview.status': { $ne: 'running' } },
      { 'aiReview.startedAt': { $lte: new Date(now - STALE_RUN_MS) } },
    ],
  };
}

const adminIds = async () => (await User.find({ role: 'admin' }).select('_id')).map((u) => u._id);

// Google's free tier refuses with 429 once the day's quota is spent. That is
// not this submission's fault, so it costs no attempt; the grader pauses and
// tries again later rather than knocking on a closed door every minute.
const RATE_PAUSE_MS = 15 * MIN;
let pausedUntil = 0;
const isRateLimited = (err) => err?.status === 429 || /\b429\b|rate.?limit|quota/i.test(err?.message || '');

const POPULATE = {
  path: 'assignmentId',
  select: 'title description batchId type rubricClass deliverables taught',
  populate: { path: 'batchId', select: 'name programId', populate: { path: 'programId', select: 'title' } },
};

/** Grade one claimed submission. Returns 'graded' | 'failed' | 'skipped' | 'paused'. */
async function gradeOne(sub, claimedAt) {
  const assignment = sub.assignmentId;
  const student = sub.studentId;
  const who = student?.fullName || student?.email || 'A student';
  const batch = assignment?.batchId?.name || 'their batch';
  const title = assignment?.title || 'an assignment';

  let review;
  try {
    // A mentor may already have run the review on this exact hand-in.
    const reusable = sub.aiReview?.final && sub.aiReview?.reviewedAt
      && new Date(sub.aiReview.reviewedAt) >= new Date(sub.submittedAt);
    review = reusable
      ? { ...sub.toObject().aiReview, status: 'done' }
      : await performReview(sub);
  } catch (err) {
    if (isRateLimited(err)) {
      pausedUntil = Date.now() + RATE_PAUSE_MS;
      await Submission.updateOne({ _id: sub._id, submittedAt: sub.submittedAt, 'aiReview.startedAt': claimedAt }, { $set: { 'aiReview.status': 'failed', 'aiReview.error': err.message } });
      return 'paused';
    }
    const attempts = err instanceof NothingToReview ? MAX_ATTEMPTS : (sub.aiReview?.attempts || 0) + 1;
    await Submission.updateOne(
      { _id: sub._id, submittedAt: sub.submittedAt, 'aiReview.startedAt': claimedAt },
      { $set: { 'aiReview.status': 'failed', 'aiReview.error': err.message, 'aiReview.reviewedAt': new Date(), 'aiReview.attempts': attempts } },
    );
    if (attempts >= MAX_ATTEMPTS) {
      notifyMany(await adminIds(), {
        type: 'grade',
        text: `AI could not grade ${who} · ${batch} · "${title}": ${err.message} Please grade it by hand.`,
        link: `/app/students/${student?._id || ''}`,
      });
    }
    return 'failed';
  }

  const score = tenPointScore(review.final);
  const feedback = assignmentOnly(review.final?.student_feedback, { brief: assignment.description, deliverables: assignment.deliverables });
  const stored = { ...review, startedAt: claimedAt, attempts: sub.aiReview?.attempts || 0 };

  // Applied only if nothing moved underneath the review: the student did not
  // edit the hand-in (submittedAt), and no mentor graded or locked it.
  const applied = await Submission.updateOne(
    { _id: sub._id, status: 'submitted', locked: false, submittedAt: sub.submittedAt },
    { $set: { score, feedback, status: 'graded', gradedBy: 'ai', locked: true, aiReview: stored } },
  );
  if (!applied.modifiedCount) {
    // A mentor got there first: keep the review beside their grade. An edited
    // hand-in: this review is of the old version, so release it to run again.
    const sameHandIn = await Submission.updateOne({ _id: sub._id, submittedAt: sub.submittedAt }, { $set: { aiReview: stored } });
    if (!sameHandIn.modifiedCount) {
      await Submission.updateOne({ _id: sub._id, 'aiReview.startedAt': claimedAt }, { $set: { 'aiReview.status': null } });
    }
    return 'skipped';
  }

  notify(student?._id, { type: 'grade', text: `Your submission for "${title}" was graded: ${score}/10.`, link: '/app/learning' });
  notifyMany(await adminIds(), {
    type: 'grade',
    text: `AI graded ${who} · ${batch} · "${title}": ${score}/10.`,
    link: `/app/students/${student?._id || ''}`,
  });
  return 'graded';
}

export async function sweepAutoGrades(now = Date.now()) {
  const counts = { graded: 0, failed: 0, skipped: 0 };
  if (now < pausedUntil) return { ...counts, paused: true };

  const due = await Submission.find(autoGradeFilter(now)).select('_id').sort({ submittedAt: 1 }).limit(PER_TICK);
  for (const { _id } of due) {
    const claimedAt = new Date();
    const sub = await Submission.findOneAndUpdate(
      { ...autoGradeFilter(now), _id },
      { $set: { 'aiReview.status': 'running', 'aiReview.startedAt': claimedAt, 'aiReview.model': AI_GRADE_MODEL, 'aiReview.error': null } },
      { new: true },
    ).populate(POPULATE).populate('studentId', 'fullName email');
    if (!sub) continue;

    const outcome = await gradeOne(sub, claimedAt);
    if (outcome === 'paused') return { ...counts, paused: true };
    counts[outcome] += 1;
  }
  return counts;
}

/** Every minute, plus once at boot, so hand-ins that waited out a deploy are graded on wake. */
export function startAutoGrader(everyMs = MIN) {
  if (/^(off|false|0)$/i.test(process.env.AUTO_GRADE || '')) {
    console.log('[autograde] off (AUTO_GRADE=off); assignments wait for a mentor.');
    return null;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.log('[autograde] off: no GEMINI_API_KEY, so assignments wait for a mentor.');
    return null;
  }
  let busy = false;
  const run = async () => {
    if (busy) return; // a slow tick must not overlap the next one
    busy = true;
    try {
      const r = await sweepAutoGrades();
      if (r.graded || r.failed) console.log(`[autograde] ${r.graded} graded${r.failed ? `, ${r.failed} failed` : ''}`);
    } catch (err) {
      console.error('[autograde] sweep failed:', err.message);
    } finally {
      busy = false;
    }
  };
  run();
  const t = setInterval(run, everyMs);
  t.unref?.();
  return t;
}
