import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { BatchLessonVideo } from '../models/BatchLessonVideo.js';
import { canAccessBatch, isMentorOfBatch, myBatchIds } from '../utils/access.js';
import { listVideos, getOtp } from '../utils/vdocipher.js';
import { claimLease } from '../utils/playback.js';
import { busyBody } from './playback.js';

// Attaching VdoCipher videos to lessons, per batch. See models/BatchLessonVideo.js
// for why the mapping is keyed on (batchId, topicId) rather than living on the
// shared curriculum topic.

const router = Router();

// GET /api/lms/lesson-videos/library?q=&page= — the VdoCipher library itself,
// so an admin/mentor can pick from videos already uploaded there. Staff only:
// this lists the whole account's videos, including ones no batch should see.
router.get('/library', requireAuth, requireRole('admin', 'mentor'), async (req, res) => {
  try {
    const { count, rows } = await listVideos({ q: req.query.q || '', page: Number(req.query.page) || 1 });
    // Only what the picker needs — id/title/length/status. `status` matters:
    // a video still encoding in VdoCipher cannot be played yet.
    res.json({
      count,
      videos: (rows || []).map((v) => ({ id: v.id, title: v.title, length: v.length, status: v.status })),
    });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not reach VdoCipher.' });
  }
});

// GET /api/lms/lesson-videos?batchId=..  — every lesson→video mapping for one
// batch. Used by the curriculum editor (staff picking videos) and by the
// lesson player (a student resolving the video for their own batch), so it is
// gated by batch membership rather than by role.
router.get('/', requireAuth, async (req, res) => {
  const { batchId } = req.query;
  let filter;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
  } else {
    // No batch named → everything across the batches this user is in, which is
    // what a student's lesson page wants (it knows the topic, not the batch).
    filter = { batchId: { $in: await myBatchIds(req.user) } };
  }
  const videos = await BatchLessonVideo.find(filter).select('batchId topicId videoId title');
  res.json({ videos });
});

/** Attaching/detaching a video is batch management, not curriculum editing:
 *  admin, or a mentor the admin put on THIS batch. */
async function canManage(req, res, batchId) {
  const batch = await Batch.findById(batchId).select('_id');
  if (!batch) {
    res.status(404).json({ error: 'Batch not found.' });
    return false;
  }
  if (!(await isMentorOfBatch(req.user, batchId))) {
    res.status(403).json({ error: 'Only mentors assigned to this batch can change its lesson videos.' });
    return false;
  }
  return true;
}

// PUT /api/lms/lesson-videos/:batchId/:topicId { videoId, title } — attach (or
// replace) the video this batch sees for this lesson.
router.put('/:batchId/:topicId', requireAuth, requireRole('admin', 'mentor'), async (req, res) => {
  const { batchId, topicId } = req.params;
  if (!(await canManage(req, res, batchId))) return;
  const videoId = String(req.body?.videoId || '').trim();
  if (!videoId) return res.status(400).json({ error: 'videoId is required.' });
  const video = await BatchLessonVideo.findOneAndUpdate(
    { batchId, topicId },
    { videoId, title: String(req.body?.title || '') },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  res.json({ video });
});

// DELETE /api/lms/lesson-videos/:batchId/:topicId — detach it again.
router.delete('/:batchId/:topicId', requireAuth, requireRole('admin', 'mentor'), async (req, res) => {
  const { batchId, topicId } = req.params;
  if (!(await canManage(req, res, batchId))) return;
  await BatchLessonVideo.deleteOne({ batchId, topicId });
  res.json({ ok: true });
});

// GET /api/lms/lesson-videos/:batchId/:topicId/otp — a short-lived OTP for the
// DRM player. Batch membership is the whole access rule: a March student asking
// for February's batch id gets a 403, which is the point of the per-batch map.
router.get('/:batchId/:topicId/otp', requireAuth, async (req, res) => {
  const { batchId, topicId } = req.params;
  if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const mapping = await BatchLessonVideo.findOne({ batchId, topicId });
  if (!mapping) return res.status(404).json({ error: 'No video posted for this lesson yet.' });

  // One watcher per account. The lock is taken HERE rather than only in the
  // player, because the OTP is the thing that actually unlocks the video: a
  // client-side check would be advisory, and this is a paid-content rule.
  // ?takeover=1 is the student answering "watch here instead".
  const { ok, lease } = await claimLease(req.user._id, {
    sid: req.deviceSession?.sid || `legacy:${req.user._id}`,
    deviceLabel: req.deviceSession?.deviceLabel || 'another device',
    videoKey: `${batchId}:${topicId}`,
    title: mapping.title || '',
    takeover: req.query.takeover === '1',
  });
  if (!ok) return res.status(409).json(busyBody(lease));

  try {
    const { otp, playbackInfo } = await getOtp(mapping.videoId);
    res.json({ otp, playbackInfo });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not load the video.' });
  }
});

export default router;
