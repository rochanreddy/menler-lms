import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Webinar } from '../models/Webinar.js';
import { User } from '../models/User.js';
import { notifyMany } from '../utils/notify.js';

const router = Router();

/** Everyone a masterclass is for: every student and mentor, since webinars are
 *  not batch-scoped — a guest session is worth the same to either cohort. */
async function audience() {
  const rows = await User.find({ role: { $in: ['student', 'mentor'] } }).select('_id').lean();
  return rows.map((u) => u._id);
}

const whenLabel = (startsAt) => (startsAt
  ? ` — ${new Date(startsAt).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST`
  : '');

// GET /api/lms/webinars — everyone sees the list (newest first).
router.get('/', requireAuth, async (_req, res) => {
  res.json({ webinars: await Webinar.find().sort({ startsAt: -1, createdAt: -1 }) });
});

// POST /api/lms/webinars — admin schedules (mentors can only join).
//
// Scheduling one notifies every student and mentor. Without this the webinar
// existed only for whoever thought to open the tab, which is how the feature
// sat unseen: a masterclass nobody is told about is a masterclass nobody
// attends.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, description, startsAt, joinUrl, pptUrl, recordingUrl } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const webinar = await Webinar.create({ title, description: description || '', startsAt: startsAt || null, joinUrl: joinUrl || '', pptUrl: pptUrl || '', recordingUrl: recordingUrl || '' });
  const people = await audience();
  await notifyMany(people, {
    type: 'webinar',
    text: `Masterclass: ${title}${whenLabel(startsAt)}`,
    link: '/app/webinar',
  });
  res.status(201).json({ webinar, notified: people.length });
});

// PATCH /api/lms/webinars/:id — admin edit (add slides/recording).
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const allowed = (({ title, description, startsAt, joinUrl, pptUrl, recordingUrl }) => ({ title, description, startsAt, joinUrl, pptUrl, recordingUrl }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const before = await Webinar.findById(req.params.id).select('recordingUrl');
  if (!before) return res.status(404).json({ error: 'Webinar not found.' });
  const webinar = await Webinar.findByIdAndUpdate(req.params.id, allowed, { new: true });

  // The recording landing is the one edit worth interrupting people for: it is
  // what everybody who missed the session is waiting on. Only when it goes from
  // absent to present, so re-saving the same link stays silent.
  if (!before.recordingUrl && webinar.recordingUrl) {
    await notifyMany(await audience(), {
      type: 'webinar',
      text: `Recording is up: ${webinar.title}`,
      link: '/app/webinar',
    });
  }
  res.json({ webinar });
});

export default router;
