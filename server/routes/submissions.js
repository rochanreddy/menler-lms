import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { canAccessBatch, isMentorOfBatch, isBlockedFromAssignment, myBatchIds } from '../utils/access.js';
import { notify } from '../utils/notify.js';
import { verifyDriveFolder } from '../utils/driveVerify.js';
import { collectSubmissionContent } from '../utils/submissionContent.js';
import { reviewSubmission, AI_GRADE_MODEL } from '../utils/aiGrade.js';

const router = Router();

function isPastDue(assignment) {
  return !!(assignment?.dueDate && new Date() > new Date(assignment.dueDate));
}

function isBeforeStart(assignment) {
  return !!(assignment?.startDate && new Date() < new Date(assignment.startDate));
}

const startsAtMsg = (a) =>
  `Submissions for this ${a?.type || 'assignment'} open on ${new Date(a.startDate).toLocaleString()}.`;

async function runCheck(sub, assignment) {
  const result = await verifyDriveFolder(sub.driveLink, {
    requiredTypes: assignment?.requiredDriveTypes,
    allowHtml: assignment?.allowHtml,
  });
  sub.checkStatus = result.status;
  sub.errorDetail = result.errorDetail;
  sub.files = result.status === 'READY' ? result.files : [];
  sub.checkedAt = new Date();
  await sub.save();

  if (result.status === 'NEEDS_FIXES') {
    notify(sub.studentId, { type: 'assignment', text: `Your submission for "${assignment?.title || 'your assignment'}" needs fixes: ${result.errorDetail}`, link: '/app/learning' });
  } else if (result.status === 'READY') {
    notify(sub.studentId, { type: 'assignment', text: `Your submission for "${assignment?.title || 'your assignment'}" was received and is in the review queue.`, link: '/app/learning' });
  }
  // CHECK_FAILED is a system fault, not the student's — no student notification.
  // Admin/mentor see it directly via checkStatus in the list/detail views instead.
  return sub;
}

// POST /api/lms/submissions  { assignmentId, driveLink } — student creates/re-submits
// a Drive-folder submission and it's verified synchronously.
router.post('/', requireAuth, async (req, res) => {
  const { assignmentId } = req.body || {};
  // Trimmed on the way in: a link pasted from WhatsApp or the Drive app
  // arrives with whitespace around it, and a stored link with a trailing
  // space is one the mentor cannot click.
  const driveLink = typeof req.body?.driveLink === 'string' ? req.body.driveLink.trim() : req.body?.driveLink;
  if (!assignmentId || !driveLink) return res.status(400).json({ error: 'assignmentId and driveLink are required.' });

  const a = await Assignment.findById(assignmentId);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (isBlockedFromAssignment(req.user, a._id)) return res.status(403).json({ error: 'This item has been blocked for your account.' });
  if (!(await canAccessBatch(req.user, a.batchId))) return res.status(403).json({ error: 'You are not in this batch.' });

  const existing = await Submission.findOne({ assignmentId: a._id, studentId: req.user._id });
  if (existing?.locked) return res.status(403).json({ error: 'This submission has been reviewed and is locked. Ask your mentor to unlock it before resubmitting.' });
  if (isBeforeStart(a)) return res.status(403).json({ error: startsAtMsg(a) });
  if (isPastDue(a)) return res.status(403).json({ error: 'The due date for this assignment has passed.' });

  const sub = await Submission.findOneAndUpdate(
    { assignmentId: a._id, studentId: req.user._id },
    { $set: { driveLink, isDeleted: false, checkStatus: 'PENDING_CHECK', errorDetail: null, status: 'submitted', locked: false } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await runCheck(sub, a);
  res.status(201).json({ submission: sub });
});

// GET /api/lms/submissions/mine — the student's own (non-deleted) submissions.
router.get('/mine', requireAuth, async (req, res) => {
  const submissions = await Submission.find({ studentId: req.user._id, isDeleted: false })
    .populate('assignmentId', 'title type dueDate')
    .sort({ updatedAt: -1 });
  res.json({ submissions });
});

// Legacy alias, kept for the existing frontend.
router.get('/me', requireAuth, async (req, res) => {
  const submissions = await Submission.find({ studentId: req.user._id, isDeleted: false }).populate('assignmentId', 'title type');
  res.json({ submissions });
});

// GET /api/lms/submissions/assignment/:assignmentId — mentor/admin lists submissions
// for one assignment (used by the existing grading UI).
router.get('/assignment/:assignmentId', requireAuth, async (req, res) => {
  const a = await Assignment.findById(req.params.assignmentId);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (!(await isMentorOfBatch(req.user, a.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const submissions = await Submission.find({ assignmentId: a._id, isDeleted: false }).populate('studentId', 'fullName email');
  res.json({ submissions });
});

// GET /api/lms/submissions — mentor/admin list across their batches, filterable
// by assignmentId/status (checkStatus).
router.get('/', requireAuth, requireRole('mentor', 'admin'), async (req, res) => {
  const { assignmentId, status } = req.query;
  const q = { isDeleted: false };
  if (assignmentId) q.assignmentId = assignmentId;
  if (status) q.checkStatus = status;

  // Scope to the mentor's own batches in the query itself, rather than
  // loading every submission on the platform and filtering afterward.
  if (req.user.role === 'mentor') {
    const batchIds = await myBatchIds(req.user);
    const myAssignments = await Assignment.find({ batchId: { $in: batchIds } }).select('_id');
    if (assignmentId) {
      // Same refusal the old post-filter produced for a foreign assignmentId
      // — decided before the query now instead of after.
      if (!myAssignments.some((a) => String(a._id) === String(assignmentId))) return res.json({ submissions: [] });
    } else {
      q.assignmentId = { $in: myAssignments.map((a) => a._id) };
    }
  }

  const submissions = await Submission.find(q)
    .populate('assignmentId', 'title type batchId dueDate')
    .populate('studentId', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(500);
  res.json({ submissions });
});

// GET /api/lms/submissions/:id — mentor/admin detail view.
router.get('/:id', requireAuth, requireRole('mentor', 'admin'), async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, isDeleted: false })
    .populate('assignmentId', 'title type batchId dueDate')
    .populate('studentId', 'fullName email');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!(await isMentorOfBatch(req.user, sub.assignmentId?.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  res.json({ submission: sub });
});

// PATCH /api/lms/submissions/:id  { driveLink?, assignmentId? } — student edits
// their own submission (own, un-locked, before the due date). Resets checkStatus
// and re-verifies — never leaves stale error text on a changed link.
router.patch('/:id', requireAuth, async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, studentId: req.user._id, isDeleted: false }).populate('assignmentId');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (sub.locked) return res.status(403).json({ error: 'This submission has been reviewed and is locked. Ask your mentor to unlock it before making changes.' });
  if (isPastDue(sub.assignmentId)) return res.status(403).json({ error: 'The due date for this assignment has passed; you can no longer edit your submission.' });

  const { driveLink, assignmentId } = req.body || {};
  let assignment = sub.assignmentId;

  if (assignmentId && String(assignmentId) !== String(assignment._id)) {
    const newAssignment = await Assignment.findById(assignmentId);
    if (!newAssignment) return res.status(404).json({ error: 'Assignment not found.' });
    if (!(await canAccessBatch(req.user, newAssignment.batchId))) return res.status(403).json({ error: 'You are not in this batch.' });
    if (isPastDue(newAssignment)) return res.status(403).json({ error: 'The due date for that assignment has passed.' });
    const clash = await Submission.findOne({ assignmentId: newAssignment._id, studentId: req.user._id, isDeleted: false });
    if (clash) return res.status(409).json({ error: 'You already have a submission for that assignment.' });
    sub.assignmentId = newAssignment._id;
    assignment = newAssignment;
  }

  if (driveLink) sub.driveLink = String(driveLink).trim();
  sub.checkStatus = 'PENDING_CHECK';
  sub.errorDetail = null;
  sub.status = 'submitted';
  await sub.save();

  await runCheck(sub, assignment);
  res.json({ submission: sub });
});

// DELETE /api/lms/submissions/:id — student soft-deletes their own submission.
router.delete('/:id', requireAuth, async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, studentId: req.user._id, isDeleted: false }).populate('assignmentId', 'dueDate');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (sub.locked) return res.status(403).json({ error: 'This submission has been reviewed and is locked. Ask your mentor to unlock it before deleting.' });
  if (isPastDue(sub.assignmentId)) return res.status(403).json({ error: 'The due date for this assignment has passed; you can no longer delete your submission.' });
  sub.isDeleted = true;
  await sub.save();
  res.json({ ok: true });
});

// PATCH /api/lms/submissions/:id/grade  { score, feedback } — mentor/admin grades,
// and locks the submission against further student edits.
router.patch('/:id/grade', requireAuth, async (req, res) => {
  const sub = await Submission.findById(req.params.id).populate('assignmentId', 'batchId');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!(await isMentorOfBatch(req.user, sub.assignmentId.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const { score, feedback } = req.body || {};
  sub.score = score === undefined || score === null || score === '' ? null : Number(score);
  sub.feedback = feedback || '';
  sub.status = 'graded';
  sub.locked = true;
  await sub.save();
  notify(sub.studentId, { type: 'grade', text: `Your submission was graded${sub.score != null ? `: ${sub.score}` : ''}.`, link: '/app/learning' });
  res.json({ submission: sub });
});

// POST /api/lms/submissions/:id/recheck — mentor/admin manually re-runs Drive
// verification (after CHECK_FAILED, or the student says permissions are fixed).
router.post('/:id/recheck', requireAuth, requireRole('mentor', 'admin'), async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, isDeleted: false }).populate('assignmentId', 'title batchId requiredDriveTypes allowHtml');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!(await isMentorOfBatch(req.user, sub.assignmentId?.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  if (!sub.driveLink) return res.status(400).json({ error: 'This submission has no Drive link to check.' });

  await runCheck(sub, sub.assignmentId);
  res.json({ submission: sub });
});

// POST /api/lms/submissions/:id/ai-review — mentor/admin runs the automated
// review (utils/aiGrade.js, scored against utils/rubric.js) over a verified
// submission.
//
// Advisory only: this writes to sub.aiReview and never touches score/feedback/
// status/locked. The mentor still grades via PATCH /:id/grade. The student is
// not notified — they should hear a verdict from their mentor, not a model.
//
// Runs synchronously: up to three model calls, so expect this to take a while.
// If it grows past what a request can hold, move it to a queue and let the
// stored aiReview.status = 'running' be what the UI polls.
router.post('/:id/ai-review', requireAuth, requireRole('mentor', 'admin'), async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, isDeleted: false })
    .populate({
      path: 'assignmentId',
      select: 'title description batchId type rubricClass deliverables taught',
      populate: { path: 'batchId', select: 'programId', populate: { path: 'programId', select: 'title' } },
    });
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });

  const assignment = sub.assignmentId;
  if (!(await isMentorOfBatch(req.user, assignment?.batchId?._id || assignment?.batchId))) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  // The review reads the files driveVerify discovered, so it needs that to have passed.
  if (sub.checkStatus !== 'READY') {
    return res.status(400).json({ error: 'This submission has not passed Drive verification yet, so there is nothing to review.' });
  }

  // The previous run's fingerprint is kept across a re-run: it is a property of
  // the submitted text, and clearing it would take this student out of every
  // other student's duplicate check for as long as the re-run takes.
  sub.aiReview.status = 'running';
  sub.aiReview.final = null;
  sub.aiReview.writeup = null;
  sub.aiReview.screenshots = null;
  sub.aiReview.model = AI_GRADE_MODEL;
  sub.aiReview.error = null;
  sub.aiReview.reviewedAt = null;
  await sub.save();

  try {
    // Class D is the creative work (the Week 3 Media Kit, the Creative Asset
    // Set). Its images are the deliverable and are judged on craft; everywhere
    // else an image is a screenshot proving a thing ran. Nothing about the file
    // itself tells you which, so the rubric class does.
    const manifest = await collectSubmissionContent(sub, { creative: assignment.rubricClass === 'D' });

    // Video alone is not something to grade. It is listed for the mentor and
    // never sent to a model, so a folder holding only a Loom has nothing in it
    // this review can read, and saying so is better than scoring it.
    const readable = manifest.items.filter((it) => it.kind !== 'video' && !it.unreadable);
    if (!readable.length) {
      throw new Error('Nothing readable was found in this submission. Documents, Claude Artifacts, PDFs and screenshots are reviewed; video is left for you to watch.');
    }

    // Everyone else who has handed in THIS assignment and has already been
    // reviewed, so the write-up can be compared against theirs. Only the stored
    // fingerprint is loaded, never their text: the comparison is between two
    // sketches, and a mentor reviewing one student has no business pulling
    // another student's work into memory.
    const peers = (await Submission.find({
      assignmentId: assignment._id,
      _id: { $ne: sub._id },
      isDeleted: false,
      'aiReview.fingerprint': { $ne: null },
    }).select('studentId aiReview.fingerprint').populate('studentId', 'fullName').limit(200))
      .map((p) => ({
        studentName: p.studentId?.fullName || 'another student',
        fingerprint: p.aiReview?.fingerprint,
      }))
      .filter((p) => p.fingerprint);

    const final = await reviewSubmission({
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

    const { fingerprint, ...result } = final;
    sub.aiReview = {
      status: 'done',
      final: result,
      fingerprint,
      writeup: null,
      screenshots: null,
      model: AI_GRADE_MODEL,
      error: null,
      reviewedAt: new Date(),
    };
    await sub.save();
    res.json({ submission: sub });
  } catch (err) {
    // aiReview is a nested path, not a subdocument — set the fields explicitly
    // rather than spreading.
    sub.aiReview.status = 'failed';
    sub.aiReview.error = err.message;
    sub.aiReview.reviewedAt = new Date();
    await sub.save();
    res.status(502).json({ error: `AI review failed: ${err.message}` });
  }
});

// POST /api/lms/submissions/:id/unlock — mentor/admin lifts the post-grade edit
// lock so the student can resubmit (grade/status are left as-is).
router.post('/:id/unlock', requireAuth, requireRole('mentor', 'admin'), async (req, res) => {
  const sub = await Submission.findOne({ _id: req.params.id, isDeleted: false }).populate('assignmentId', 'batchId');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!(await isMentorOfBatch(req.user, sub.assignmentId?.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  sub.locked = false;
  await sub.save();
  res.json({ submission: sub });
});

export default router;
