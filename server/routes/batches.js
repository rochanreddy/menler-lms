import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { canAccessBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// GET /api/lms/batches — role-scoped: admin=all, mentor/student=their batches.
router.get('/', requireAuth, async (req, res) => {
  const ids = await myBatchIds(req.user);
  const batches = await Batch.find({ _id: { $in: ids } })
    .populate('programId', 'title')
    .sort({ createdAt: -1 });
  res.json({
    batches: batches.map((b) => ({
      id: b._id, name: b.name, status: b.status,
      program: b.programId?.title || '', programId: b.programId?._id,
      startDate: b.startDate, endDate: b.endDate,
      mentorCount: b.mentorIds.length, studentCount: b.studentIds.length,
    })),
  });
});

// GET /api/lms/batches/:id — full batch with roster (members + admin only).
router.get('/:id', requireAuth, async (req, res) => {
  if (!(await canAccessBatch(req.user, req.params.id))) return res.status(403).json({ error: 'Forbidden.' });
  const b = await Batch.findById(req.params.id)
    .populate('programId', 'title')
    .populate('mentorIds', 'fullName email')
    .populate('studentIds', 'fullName email');
  if (!b) return res.status(404).json({ error: 'Batch not found.' });
  res.json({ batch: b });
});

// POST /api/lms/batches — admin creates a batch under a program.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { programId, name, startDate, endDate, status } = req.body || {};
  if (!programId || !name) return res.status(400).json({ error: 'programId and name are required.' });
  const batch = await Batch.create({ programId, name, startDate: startDate || null, endDate: endDate || null, status: status || 'upcoming' });
  res.status(201).json({ batch });
});

// PATCH /api/lms/batches/:id — admin edits name/dates/status.
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const allowed = (({ name, startDate, endDate, status }) => ({ name, startDate, endDate, status }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const batch = await Batch.findByIdAndUpdate(req.params.id, allowed, { new: true });
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });
  res.json({ batch });
});

// DELETE /api/lms/batches/:id — admin.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await Batch.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// Helper: add a member (mentor or student) by email, keeping both the batch's
// list and the user's batchIds in sync.
async function addMember(res, batchId, email, field) {
  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!user) return res.status(404).json({ error: 'No user with that email.' });
  await Batch.findByIdAndUpdate(batchId, { $addToSet: { [field]: user._id } });
  await User.findByIdAndUpdate(user._id, { $addToSet: { batchIds: batchId } });
  return res.json({ ok: true, user: user.toPublic() });
}

// POST /api/lms/batches/:id/mentors { email } — admin assigns a mentor.
router.post('/:id/mentors', requireAuth, requireRole('admin'), (req, res) =>
  addMember(res, req.params.id, req.body?.email, 'mentorIds'),
);

// POST /api/lms/batches/:id/students { email } — admin enrolls a student.
router.post('/:id/students', requireAuth, requireRole('admin'), (req, res) =>
  addMember(res, req.params.id, req.body?.email, 'studentIds'),
);

// DELETE /api/lms/batches/:id/members/:userId — admin removes a member from either list.
router.delete('/:id/members/:userId', requireAuth, requireRole('admin'), async (req, res) => {
  const { id, userId } = req.params;
  await Batch.findByIdAndUpdate(id, { $pull: { mentorIds: userId, studentIds: userId } });
  await User.findByIdAndUpdate(userId, { $pull: { batchIds: id } });
  res.json({ ok: true });
});

export default router;
