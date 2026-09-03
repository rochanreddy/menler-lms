import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Session } from '../models/Session.js';
import { canAccessBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// Pull a Zoom meeting id out of a join URL (…/j/8451234567?…). Registration
// links don't contain it, so the mentor can also enter it manually.
function extractMeetingId(url) {
  const s = String(url || '');
  const m = s.match(/\/j\/(\d{9,12})/) || s.match(/(\d{9,12})/);
  return m ? m[1] : '';
}

// GET /api/lms/sessions?batchId=..  OR  ?scope=upcoming|past
// - batchId: sessions for one batch (members only)
// - otherwise: sessions across all the user's batches (for Home/calendar)
router.get('/', requireAuth, async (req, res) => {
  const { batchId, scope } = req.query;
  let filter;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
  } else {
    filter = { batchId: { $in: await myBatchIds(req.user) } };
  }
  const now = new Date();
  if (scope === 'upcoming') filter.startsAt = { $gte: now };
  if (scope === 'past') filter.startsAt = { $lt: now };

  const sessions = await Session.find(filter)
    .populate('batchId', 'name')
    .sort({ startsAt: scope === 'past' ? -1 : 1 });
  res.json({ sessions });
});

// GET /api/lms/sessions/live?dayStart=&dayEnd= — the one session the Home
// "Join Live Class" CTA cares about: today's class if there is one, else the
// most recent past one. dayStart/dayEnd are ISO instants for the CALLER's
// local midnight-to-midnight window — "today" has to mean the student's own
// calendar day, not the server's, so the client computes and sends it rather
// than the server guessing a timezone. Falls back to the server's own UTC day
// only if they're missing/invalid (defensive — every real caller sends them).
router.get('/live', requireAuth, async (req, res) => {
  const batchIds = await myBatchIds(req.user);
  const reqStart = new Date(req.query.dayStart);
  const reqEnd = new Date(req.query.dayEnd);
  const validRange = !Number.isNaN(+reqStart) && !Number.isNaN(+reqEnd) && reqEnd > reqStart;
  const dayStart = validRange ? reqStart : new Date(new Date().toISOString().slice(0, 10));
  const dayEnd = validRange ? reqEnd : new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const today = await Session.findOne({ batchId: { $in: batchIds }, startsAt: { $gte: dayStart, $lt: dayEnd } })
    .populate('batchId', 'name')
    .sort({ startsAt: 1 });
  const session = today || await Session.findOne({ batchId: { $in: batchIds }, startsAt: { $lt: dayStart } })
    .populate('batchId', 'name')
    .sort({ startsAt: -1 });

  if (!session) return res.json({ session: null, today: false, url: '' });

  const isToday = !!today;
  res.json({
    session: { _id: session._id, title: session.title, startsAt: session.startsAt, batchId: session.batchId },
    today: isToday,
    // A finished class may only have a recording — better than a dead button.
    url: session.joinUrl || (!isToday && session.recordingUrl) || '',
    updatedAt: session.updatedAt,
  });
});

// POST /api/lms/sessions — admin schedules a class (only admins create Zoom sessions).
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { batchId, title, startsAt, endsAt, joinUrl, zoomMeetingId } = req.body || {};
  if (!batchId || !title || !startsAt) return res.status(400).json({ error: 'batchId, title and startsAt are required.' });
  const meetingId = String(zoomMeetingId || '').trim() || extractMeetingId(joinUrl);
  const session = await Session.create({ batchId, title, startsAt, endsAt: endsAt || null, joinUrl: joinUrl || '', zoomMeetingId: meetingId });
  res.status(201).json({ session });
});

// PATCH /api/lms/sessions/:id — admin edits (e.g. add recordingUrl).
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const allowed = (({ title, startsAt, endsAt, joinUrl, recordingUrl, zoomMeetingId }) => ({ title, startsAt, endsAt, joinUrl, recordingUrl, zoomMeetingId }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  if (allowed.joinUrl && allowed.zoomMeetingId === undefined && !session.zoomMeetingId) allowed.zoomMeetingId = extractMeetingId(allowed.joinUrl);
  Object.assign(session, allowed);
  await session.save();
  res.json({ session });
});

export default router;
