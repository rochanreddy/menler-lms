import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Attendance } from '../models/Attendance.js';
import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { isMentorOfBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// GET /api/lms/attendance/overview — attendance % per batch the user teaches/owns
// (mentor/admin). Powers the "attendance by course" chart on the mentor board.
router.get('/overview', requireAuth, async (req, res) => {
  const ids = await myBatchIds(req.user);
  const batches = await Batch.find({ _id: { $in: ids } }).select('name');
  const overview = [];
  for (const b of batches) {
    const rows = await Attendance.find({ batchId: b._id });
    const total = rows.length;
    const present = rows.filter((r) => r.status === 'present').length;
    overview.push({ batchId: b._id, name: b.name, pct: total ? Math.round((present / total) * 100) : 0, total });
  }
  res.json({ overview });
});

// POST /api/lms/attendance/session/:sessionId  { records: [{ studentId, status }] }
// Mentor of the batch marks attendance for a session (upserts each record).
router.post('/session/:sessionId', requireAuth, async (req, res) => {
  const session = await Session.findById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!(await isMentorOfBatch(req.user, session.batchId))) return res.status(403).json({ error: 'Forbidden.' });

  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  await Promise.all(records.map((r) =>
    Attendance.updateOne(
      { sessionId: session._id, studentId: r.studentId },
      { $set: { status: r.status === 'present' ? 'present' : 'absent', batchId: session.batchId } },
      { upsert: true },
    ),
  ));
  res.json({ ok: true, marked: records.length });
});

// GET /api/lms/attendance/session/:sessionId — mentor/admin sees who's marked.
router.get('/session/:sessionId', requireAuth, async (req, res) => {
  const session = await Session.findById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!(await isMentorOfBatch(req.user, session.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const records = await Attendance.find({ sessionId: session._id });
  res.json({ records });
});

// GET /api/lms/attendance/me — the logged-in student's attendance %.
router.get('/me', requireAuth, async (req, res) => {
  const rows = await Attendance.find({ studentId: req.user._id });
  const total = rows.length;
  const present = rows.filter((r) => r.status === 'present').length;
  res.json({ present, total, pct: total ? Math.round((present / total) * 100) : 0 });
});

export default router;
