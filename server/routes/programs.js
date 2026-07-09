import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Program } from '../models/Program.js';

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

// PATCH /api/lms/programs/:id — admin only (edit fields or the modules tree).
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const allowed = (({ title, type, description, slug, published, modules }) => ({ title, type, description, slug, published, modules }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const program = await Program.findByIdAndUpdate(req.params.id, allowed, { new: true });
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  res.json({ program });
});

export default router;
