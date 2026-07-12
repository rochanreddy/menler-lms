import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Announcement } from '../models/Announcement.js';
import { Batch } from '../models/Batch.js';
import { canAccessBatch, isMentorOfBatch, myBatchIds } from '../utils/access.js';
import { notifyMany } from '../utils/notify.js';

const router = Router();

// GET /api/lms/announcements?batchId=..  OR  (no batchId) across the user's batches.
router.get('/', requireAuth, async (req, res) => {
  const { batchId } = req.query;
  let filter;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
  } else {
    filter = { batchId: { $in: await myBatchIds(req.user) } };
  }
  const items = await Announcement.find(filter)
    .populate('authorId', 'fullName email role')
    .populate('batchId', 'name')
    .sort({ createdAt: -1 }).limit(50);
  res.json({ announcements: items });
});

// POST /api/lms/announcements { batchId, title, body } — mentor/admin broadcast.
router.post('/', requireAuth, async (req, res) => {
  const { batchId, title, body } = req.body || {};
  if (!batchId || !title) return res.status(400).json({ error: 'batchId and title are required.' });
  if (!(await isMentorOfBatch(req.user, batchId))) return res.status(403).json({ error: 'Only a mentor of this batch can post.' });
  const ann = await Announcement.create({ batchId, authorId: req.user._id, title, body: body || '' });
  const batch = await Batch.findById(batchId).select('studentIds');
  notifyMany(batch?.studentIds || [], { type: 'announcement', text: `📢 ${title}`, link: '/app' });
  res.status(201).json({ announcement: ann });
});

export default router;
