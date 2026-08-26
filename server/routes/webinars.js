import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Webinar } from '../models/Webinar.js';

const router = Router();

// GET /api/lms/webinars — everyone sees the list (newest first).
router.get('/', requireAuth, async (_req, res) => {
  res.json({ webinars: await Webinar.find().sort({ startsAt: -1, createdAt: -1 }) });
});

// POST /api/lms/webinars — admin schedules (mentors can only join).
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, description, startsAt, joinUrl, pptUrl, recordingUrl } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const webinar = await Webinar.create({ title, description: description || '', startsAt: startsAt || null, joinUrl: joinUrl || '', pptUrl: pptUrl || '', recordingUrl: recordingUrl || '' });
  res.status(201).json({ webinar });
});

// PATCH /api/lms/webinars/:id — admin edit (add slides/recording).
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const allowed = (({ title, description, startsAt, joinUrl, pptUrl, recordingUrl }) => ({ title, description, startsAt, joinUrl, pptUrl, recordingUrl }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const webinar = await Webinar.findByIdAndUpdate(req.params.id, allowed, { new: true });
  if (!webinar) return res.status(404).json({ error: 'Webinar not found.' });
  res.json({ webinar });
});

export default router;
