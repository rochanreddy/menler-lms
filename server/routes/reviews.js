import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ClassReview } from '../models/ClassReview.js';
import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { myBatchIds } from '../utils/access.js';
import { sessionEnd } from '../utils/sessionTime.js';

const router = Router();

// The four scored questions, in the order they are asked. 1 is low, 5 is high.
export const SCORE_KEYS = ['overall', 'useful', 'understanding', 'instructor'];
const SCORE_LABEL = {
  overall: 'how you rate the session',
  useful: 'how useful it was',
  understanding: 'how well you understood it',
  instructor: 'the instructor and session experience',
};

/**
 * Classes this student still owes a review for, oldest first.
 *
 * Two bounds keep the gate from becoming a wall. A class counts the moment it
 * ENDS — a 7–9 class is reviewable at 9, not an hour later: the attendance
 * window's hour of grace exists for stragglers still joining, which is the
 * opposite of when an opinion is ready. And only classes that started after
 * the account was created: someone enrolled into week four cannot review weeks
 * one to three, and should not have to dismiss three forms to reach the LMS.
 */
async function owed(user) {
  const batchIds = await myBatchIds(user);
  if (!batchIds.length) return [];
  const sessions = await Session.find({
    batchId: { $in: batchIds },
    startsAt: { $lt: new Date(), $gte: user.createdAt || new Date(0) },
  }).populate('batchId', 'name').sort({ startsAt: 1 });

  const over = sessions.filter((s) => sessionEnd(s) <= Date.now());
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

// POST /api/lms/reviews/:sessionId { overall, useful, understanding, instructor, comment }
router.post('/:sessionId', requireAuth, requireRole('student'), async (req, res) => {
  const session = await Session.findById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Class not found.' });
  const batchIds = (await myBatchIds(req.user)).map(String);
  if (!batchIds.includes(String(session.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  if (sessionEnd(session) > Date.now()) return res.status(400).json({ error: 'That class is not over yet.' });

  // Every score is answered or none are: a half-filled review is worse than no
  // review, because it reads as a considered low score on the blank ones.
  const scores = {};
  for (const key of SCORE_KEYS) {
    const n = Number(req.body?.[key]);
    if (!(n >= 1 && n <= 5)) return res.status(400).json({ error: `Answer all five: ${SCORE_LABEL[key]}` });
    scores[key] = Math.round(n);
  }

  const attendance = await Attendance.findOne({ sessionId: session._id, studentId: req.user._id }).select('status');
  await ClassReview.updateOne(
    { sessionId: session._id, studentId: req.user._id },
    {
      $set: {
        batchId: session.batchId,
        ...scores,
        comment: String(req.body?.comment || '').slice(0, 2000),
        attended: attendance?.status === 'present',
      },
    },
    { upsert: true },
  );

  // What's left tells the gate whether to ask again or let them in.
  res.json({ ok: true, remaining: (await owed(req.user)).length });
});

// GET /api/lms/reviews?batchId=&sessionId= — the admin sees every review; a
// mentor sees the reviews of the classes THEY taught, which is their own
// batches and nobody else's (Session carries no mentor, so the batch is the
// link — two mentors sharing a batch share its feedback).
//
// **A mentor is never told who wrote one.** That is what is left of the old
// rule that mentors saw none of this at all: a mentor who cannot improve
// without reading their own scores also cannot be trusted with a name against
// a 2★, and a student who thinks their mentor can see their name writes the
// review they think is safe. So the scores and the words travel and the
// student does not.
router.get('/', requireAuth, requireRole('admin', 'mentor'), async (req, res) => {
  const mine = req.user.role === 'mentor' ? (await myBatchIds(req.user)).map(String) : null;
  if (mine && !mine.length) {
    return res.json({ batches: [], summary: { count: 0, averages: Object.fromEntries(SCORE_KEYS.map((k) => [k, 0])) }, reviews: [] });
  }

  const q = {};
  // A programme is every batch that runs it — one today, several next intake.
  // A named batch narrows further, so the two compose rather than conflict.
  // Every one of these is then intersected with what the viewer may see, so a
  // mentor typing another cohort's id in the query string gets nothing back.
  let scopeIds = mine;
  if (req.query.programId) {
    const ids = (await Batch.find({ programId: req.query.programId }).select('_id')).map((b) => String(b._id));
    scopeIds = scopeIds ? scopeIds.filter((id) => ids.includes(id)) : ids;
  }
  if (req.query.batchId) {
    const one = String(req.query.batchId);
    scopeIds = scopeIds ? scopeIds.filter((id) => id === one) : [one];
  }
  if (scopeIds) q.batchId = { $in: scopeIds };
  if (req.query.sessionId) q.sessionId = req.query.sessionId;

  const reviews = await ClassReview.find(q).sort({ createdAt: -1 }).limit(500).lean();
  const [students, sessions, batches] = await Promise.all([
    mine ? [] : User.find({ _id: { $in: reviews.map((r) => r.studentId) } }).select('fullName email').lean(),
    Session.find({ _id: { $in: reviews.map((r) => r.sessionId) } }).select('title startsAt').lean(),
    Batch.find(mine ? { _id: { $in: mine } } : {}).select('name programId').populate('programId', 'title').lean(),
  ]);
  const byId = (rows) => Object.fromEntries(rows.map((r) => [String(r._id), r]));
  const S = byId(students); const Z = byId(sessions); const B = byId(batches);

  // An average per question, so a class that scored well but was understood by
  // nobody shows the gap instead of hiding inside one number.
  const averages = Object.fromEntries(SCORE_KEYS.map((k) => {
    const sum = reviews.reduce((n, r) => n + (r[k] || 0), 0);
    return [k, reviews.length ? Math.round((sum / reviews.length) * 10) / 10 : 0];
  }));

  res.json({
    // The filter tree: every batch with the programme it belongs to, so the
    // page can offer programme tabs and the batches under each without a
    // second request — and keep offering them while a filter is applied.
    batches: batches.map((b) => ({
      id: String(b._id),
      name: b.name,
      program: b.programId?.title || '',
      programId: b.programId?._id ? String(b.programId._id) : '',
    })),
    summary: { count: reviews.length, averages },
    reviews: reviews.map((r) => ({
      id: String(r._id),
      scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, r[k] || 0])),
      comment: r.comment,
      attended: r.attended,
      createdAt: r.createdAt,
      // Empty for a mentor, and the page says "A student" in its place.
      student: mine ? { name: '', email: '' } : { name: S[String(r.studentId)]?.fullName || '', email: S[String(r.studentId)]?.email || '' },
      // The id travels so the page can group a class's reviews together —
      // two classes can share a title across cohorts.
      session: { id: String(r.sessionId), title: Z[String(r.sessionId)]?.title || '', startsAt: Z[String(r.sessionId)]?.startsAt || null },
      batch: B[String(r.batchId)]?.name || '',
    })),
  });
});

export default router;
