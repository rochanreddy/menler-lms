import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Batch } from '../models/Batch.js';
import { canAccessBatch, isMentorOfBatch, myBatchIds, isBlockedFromAssignment } from '../utils/access.js';
import { notifyMany } from '../utils/notify.js';

const router = Router();

// GET /api/lms/assignments?batchId=..  OR  ?scope=mine
// With scope=mine, each assignment carries the requesting student's submission
// (so the UI can show "due" vs "submitted" vs "graded").
router.get('/', requireAuth, async (req, res) => {
  const { batchId, scope } = req.query;
  let filter;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
  } else {
    filter = { batchId: { $in: await myBatchIds(req.user) } };
  }
  let assignments = await Assignment.find(filter).populate('batchId', 'name').sort({ createdAt: -1 });
  // Admin-blocked assignments/projects simply don't exist for this user.
  assignments = assignments.filter((a) => !isBlockedFromAssignment(req.user, a._id));

  if (scope === 'mine') {
    const subs = await Submission.find({ studentId: req.user._id, assignmentId: { $in: assignments.map((a) => a._id) } });
    const byId = new Map(subs.map((s) => [s.assignmentId.toString(), s]));
    return res.json({ assignments: assignments.map((a) => ({ ...a.toObject(), mySubmission: byId.get(a._id.toString()) || null })) });
  }
  res.json({ assignments });
});

// POST /api/lms/assignments — mentor of the batch (or admin) sets an assignment/project.
router.post('/', requireAuth, async (req, res) => {
  const { batchId, type, title, description, dueDate } = req.body || {};
  if (!batchId || !title) return res.status(400).json({ error: 'batchId and title are required.' });
  if (!(await isMentorOfBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const assignment = await Assignment.create({ batchId, type: type === 'project' ? 'project' : 'assignment', title, description: description || '', dueDate: dueDate || null });
  const batch = await Batch.findById(batchId).select('studentIds');
  notifyMany(batch?.studentIds || [], { type: 'assignment', text: `New ${assignment.type}: ${title}`, link: '/app/learning' });
  res.status(201).json({ assignment });
});

// GET /api/lms/assignments/:id
router.get('/:id', requireAuth, async (req, res) => {
  const a = await Assignment.findById(req.params.id).populate('batchId', 'name');
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  if (isBlockedFromAssignment(req.user, a._id)) return res.status(403).json({ error: 'This item has been blocked for your account.' });
  if (!(await canAccessBatch(req.user, a.batchId._id || a.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  res.json({ assignment: a });
});

export default router;
