import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Notification } from '../models/Notification.js';

const router = Router();

// GET /api/lms/notifications — the user's recent notifications + unread count.
// Polled every 20s by every signed-in tab, so it is the most-called endpoint in
// the app. The two reads are independent -- running them concurrently halves the
// endpoint's latency (it still issues two operations, it just stops waiting for
// the first before starting the second).
//
// Quizzes are retired, so the "New quiz: …" rows written while they existed
// are left out of both: a bell that still announces one points at nothing.
const RETIRED_TYPES = { $nin: ['quiz'] };
router.get('/', requireAuth, async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ userId: req.user._id, type: RETIRED_TYPES }).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ userId: req.user._id, read: false, type: RETIRED_TYPES }),
  ]);
  res.json({ items, unread });
});

// POST /api/lms/notifications/read — mark all as read.
router.post('/read', requireAuth, async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

export default router;
