import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { canAccessBatch, isMentorOfBatch, isBlockedFromAssignment } from '../utils/access.js';
import { notify } from '../utils/notify.js';

const router = Router();

// POST /api/lms/submissions/assignment/:assignmentId  { url, text }
// Student submits (or re-submits, until graded) for an assignment in their batch.
router.post('/assignment/:assignmentId', requireAuth, async (req, res) => {
  const a = await Assignment.findById(req.params.assignmentId);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (isBlockedFromAssignment(req.user, a._id)) return res.status(403).json({ error: 'This item has been blocked for your account.' });
  if (!(await canAccessBatch(req.user, a.batchId))) return res.status(403).json({ error: 'You are not in this batch.' });

  const { url, text } = req.body || {};
  const sub = await Submission.findOneAndUpdate(
    { assignmentId: a._id, studentId: req.user._id },
    { $set: { url: url || '', text: text || '', status: 'submitted' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.status(201).json({ submission: sub });
});

// GET /api/lms/submissions/assignment/:assignmentId — mentor/admin lists submissions.
router.get('/assignment/:assignmentId', requireAuth, async (req, res) => {
  const a = await Assignment.findById(req.params.assignmentId);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (!(await isMentorOfBatch(req.user, a.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const submissions = await Submission.find({ assignmentId: a._id }).populate('studentId', 'fullName email');
  res.json({ submissions });
});

// PATCH /api/lms/submissions/:id/grade  { score, feedback } — mentor/admin grades.
router.patch('/:id/grade', requireAuth, async (req, res) => {
  const sub = await Submission.findById(req.params.id).populate('assignmentId', 'batchId');
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  if (!(await isMentorOfBatch(req.user, sub.assignmentId.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const { score, feedback } = req.body || {};
  sub.score = score === undefined || score === null || score === '' ? null : Number(score);
  sub.feedback = feedback || '';
  sub.status = 'graded';
  await sub.save();
  notify(sub.studentId, { type: 'grade', text: `Your submission was graded${sub.score != null ? `: ${sub.score}` : ''}.`, link: '/app/learning' });
  res.json({ submission: sub });
});

// GET /api/lms/submissions/me — the student's own submissions.
router.get('/me', requireAuth, async (req, res) => {
  const submissions = await Submission.find({ studentId: req.user._id }).populate('assignmentId', 'title type');
  res.json({ submissions });
});

export default router;
