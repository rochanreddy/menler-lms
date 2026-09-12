import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ClassReview } from '../models/ClassReview.js';
import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { myBatchIds } from '../utils/access.js';
import { joinWindow } from '../utils/sessionTime.js';

const router = Router();

/**
 * Classes this student still owes a review for, oldest first.
 *
 * Two bounds keep the gate from becoming a wall. A class only counts once its
 * join window has closed — reviewing a class that is still running asks for an
 * opinion nobody has yet. And only classes that started after the account was
 * created: someone enrolled into week four cannot review weeks one to three,
 * and should not have to dismiss three forms to reach the LMS.
 */
async function owed(user) {
  const batchIds = await myBatchIds(user);
  if (!batchIds.length) return [];
  const sessions = await Session.find({
    batchId: { $in: batchIds },
    startsAt: { $lt: new Date(), $gte: user.createdAt || new Date(0) },
  }).populate('batchId', 'name').sort({ startsAt: 1 });

  const over = sessions.filter((s) => joinWindow(s).closes <= Date.now());
  if (!over.length) return [];
  const done = new Set(
    (await ClassReview.find({ studentId: user._id, sessionId: { $in: over.map((s) => s._id) } }).select('sessionId'))
      .map((r) => String(r.sessionId)),
  );
  return over.filter((s) => !done.has(String(s._id)));
}

// GET /api/lms/reviews/pending — the one class the gate should ask about, plus
// how many are still queued behind it.
router.get('/pending', requireAuth, async (req, res) => {
  if (req.user.role !== 'student') return res.json({ session: null, remaining: 0 });
  const list = await owed(req.user);
  const s = list[0];
  res.json({
    session: s ? { _id: s._id, title: s.title, startsAt: s.startsAt, batch: s.batchId?.name || '' } : null,
    remaining: list.length,
  });
});

// POST /api/lms/reviews/:sessionId { rating, pace, comment }
router.post('/:sessionId', requireAuth, requireRole('student'), async (req, res) => {
  const session = await Session.findById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Class not found.' });
  const batchIds = (await myBatchIds(req.user)).map(String);
  if (!batchIds.includes(String(session.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  if (joinWindow(session).closes > Date.now()) return res.status(400).json({ error: 'That class is not over yet.' });

  const rating = Number(req.body?.rating);
  const pace = String(req.body?.pace || '');
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Pick a rating from 1 to 5.' });
  if (!['slow', 'right', 'fast'].includes(pace)) return res.status(400).json({ error: 'Pick how the pace felt.' });

  const attendance = await Attendance.findOne({ sessionId: session._id, studentId: req.user._id }).select('status');
  await ClassReview.updateOne(
    { sessionId: session._id, studentId: req.user._id },
    {
      $set: {
        batchId: session.batchId,
        rating: Math.round(rating),
        pace,
        comment: String(req.body?.comment || '').slice(0, 2000),
        attended: attendance?.status === 'present',
      },
    },
    { upsert: true },
  );

  // What's left tells the gate whether to ask again or let them in.
  res.json({ ok: true, remaining: (await owed(req.user)).length });
});

// GET /api/lms/reviews?batchId=&sessionId= — admin only. Mentors are
// deliberately excluded: a review of a class is feedback ABOUT the person who
// taught it, and students answer differently when the mentor is reading.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const q = {};
  if (req.query.batchId) q.batchId = req.query.batchId;
  if (req.query.sessionId) q.sessionId = req.query.sessionId;

  const reviews = await ClassReview.find(q).sort({ createdAt: -1 }).limit(500).lean();
  const [students, sessions, batches] = await Promise.all([
    User.find({ _id: { $in: reviews.map((r) => r.studentId) } }).select('fullName email').lean(),
    Session.find({ _id: { $in: reviews.map((r) => r.sessionId) } }).select('title startsAt').lean(),
    Batch.find().select('name programId').populate('programId', 'title').lean(),
  ]);
  const byId = (rows) => Object.fromEntries(rows.map((r) => [String(r._id), r]));
  const S = byId(students); const Z = byId(sessions); const B = byId(batches);

  const pace = { slow: 0, right: 0, fast: 0 };
  let sum = 0;
  for (const r of reviews) { sum += r.rating; pace[r.pace] = (pace[r.pace] || 0) + 1; }

  res.json({
    // The filter list: every batch, so the page can offer Kickstarter and
    // Generalist without a second request.
    batches: batches.map((b) => ({ id: String(b._id), name: b.name, program: b.programId?.title || '' })),
    summary: { count: reviews.length, avg: reviews.length ? Math.round((sum / reviews.length) * 10) / 10 : 0, pace },
    reviews: reviews.map((r) => ({
      id: String(r._id),
      rating: r.rating,
      pace: r.pace,
      comment: r.comment,
      attended: r.attended,
      createdAt: r.createdAt,
      student: { name: S[String(r.studentId)]?.fullName || '', email: S[String(r.studentId)]?.email || '' },
      session: { title: Z[String(r.sessionId)]?.title || '', startsAt: Z[String(r.sessionId)]?.startsAt || null },
      batch: B[String(r.batchId)]?.name || '',
    })),
  });
});

export default router;
