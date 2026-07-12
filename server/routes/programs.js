import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Program } from '../models/Program.js';
import { User } from '../models/User.js';

const router = Router();

// GET /api/lms/programs — any logged-in user lists programs.
router.get('/', requireAuth, async (_req, res) => {
  const programs = await Program.find().sort({ createdAt: -1 });
  res.json({ programs });
});

// GET /api/lms/programs/:id — full curriculum tree.
router.get('/:id', requireAuth, async (req, res) => {
  const program = await Program.findById(req.params.id);
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  res.json({ program });
});

// POST /api/lms/programs — admin only.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, type, description, slug } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const program = await Program.create({ title, type: type || '', description: description || '', slug: slug || '' });
  res.status(201).json({ program });
});

// POST /api/lms/programs/:id/mentors { userId | email } — admin assigns a mentor
// to teach this program (grants access to all its batches).
router.post('/:id/mentors', requireAuth, requireRole('admin'), async (req, res) => {
  const { userId, email } = req.body || {};
  const mentor = userId
    ? await User.findById(userId)
    : await User.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!mentor || mentor.role !== 'mentor') return res.status(404).json({ error: 'Mentor not found.' });
  await Program.findByIdAndUpdate(req.params.id, { $addToSet: { mentorIds: mentor._id } });
  res.json({ ok: true });
});

// DELETE /api/lms/programs/:id/mentors/:userId — admin un-assigns a mentor.
router.delete('/:id/mentors/:userId', requireAuth, requireRole('admin'), async (req, res) => {
  await Program.findByIdAndUpdate(req.params.id, { $pull: { mentorIds: req.params.userId } });
  res.json({ ok: true });
});

// PATCH /api/lms/programs/:id — admin only (edit fields or the modules tree).
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const allowed = (({ title, type, description, slug, published, modules }) => ({ title, type, description, slug, published, modules }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const program = await Program.findByIdAndUpdate(req.params.id, allowed, { new: true });
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  res.json({ program });
});

export default router;
