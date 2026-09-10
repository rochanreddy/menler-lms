import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Batch } from '../models/Batch.js';
import { isMentorOfBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// GET /api/lms/grades/me — the student's consolidated gradebook: every
// assignment and quiz across their batches, with their own score/status.
router.get('/me', requireAuth, async (req, res) => {
  const batchIds = await myBatchIds(req.user);
  const [assignments, quizzes, batches] = await Promise.all([
    Assignment.find({ batchId: { $in: batchIds } }),
    Quiz.find({ batchId: { $in: batchIds } }),
    Batch.find({ _id: { $in: batchIds } }).select('name startDate'),
  ]);
  const [subs, attempts] = await Promise.all([
    Submission.find({ studentId: req.user._id, assignmentId: { $in: assignments.map((a) => a._id) } }),
    QuizAttempt.find({ studentId: req.user._id, quizId: { $in: quizzes.map((q) => q._id) } }),
  ]);
  const subBy = new Map(subs.map((s) => [s.assignmentId.toString(), s]));
  const attBy = new Map(attempts.map((a) => [a.quizId.toString(), a]));

  // In the order the course runs, not the order the rows were written. This
  // used to be newest-first, which read as reverse once the curriculum's work
  // was created in one pass in syllabus order: the last project came first and
  // week 1's assignment came last. So: one batch at a time (earliest start
  // first — a student in two programmes shouldn't see them interleaved, since
  // both have a "week 1"), then by the week or session the work belongs to,
  // then assignment before project the way each week is taught, with quizzes
  // after. Anything outside the curriculum has no week and follows the rest.
  const batchRank = new Map(
    [...batches]
      .sort((x, y) => (new Date(x.startDate || 0) - new Date(y.startDate || 0)) || x.name.localeCompare(y.name))
      .map((b, i) => [String(b._id), i]),
  );
  const KIND_RANK = { Assignment: 0, Project: 1, Quiz: 2, Exam: 3 };

  const rows = [
    ...assignments.map((a) => {
      const s = subBy.get(a._id.toString());
      return {
        // The Type column said "Assignment" for a project too, which is how
        // P04 and every milestone ended up labelled as assignments.
        id: a._id, kind: a.type === 'project' ? 'Project' : 'Assignment', title: a.title,
        status: s ? s.status : 'pending',
        score: s && s.score != null ? s.score : null,
        max: 10, // assignments graded out of 10
        feedback: s?.feedback || '',
        at: a.createdAt,
        batch: String(a.batchId),
        week: Number.isFinite(a.week) ? a.week : null,
      };
    }),
    ...quizzes.map((q) => {
      const at = attBy.get(q._id.toString());
      return {
        id: q._id, kind: q.type === 'exam' ? 'Exam' : 'Quiz', title: q.title,
        status: at ? 'graded' : 'pending',
        score: at ? at.score : null,
        max: at ? at.total : q.questions?.length ?? null,
        feedback: '',
        at: q.createdAt,
        batch: String(q.batchId),
        week: null,
      };
    }),
  ].sort((x, y) =>
    ((batchRank.get(x.batch) ?? 0) - (batchRank.get(y.batch) ?? 0))
    || ((x.week ?? Infinity) - (y.week ?? Infinity) || 0)
    || (KIND_RANK[x.kind] - KIND_RANK[y.kind])
    || (new Date(x.at) - new Date(y.at)));

  // Average across quiz/exam percentages (the only ones with a defined max).
  const pcts = rows.filter((r) => r.max && r.score != null).map((r) => (r.score / r.max) * 100);
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const graded = rows.filter((r) => r.status === 'graded').length;

  res.json({ rows, summary: { total: rows.length, graded, avgPct } });
});

// GET /api/lms/grades/batch/:batchId — mentor gradebook grid: a matrix of
// every student in the batch against every assessment.
router.get('/batch/:batchId', requireAuth, async (req, res) => {
  const { batchId } = req.params;
  if (!(await isMentorOfBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const batch = await Batch.findById(batchId).populate('studentIds', 'fullName email');
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });

  const [assignments, quizzes] = await Promise.all([
    Assignment.find({ batchId }).sort({ createdAt: 1 }),
    Quiz.find({ batchId }).sort({ createdAt: 1 }),
  ]);
  const [subs, attempts] = await Promise.all([
    Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) } }),
    QuizAttempt.find({ quizId: { $in: quizzes.map((q) => q._id) } }),
  ]);

  const columns = [
    ...assignments.map((a) => ({ id: a._id.toString(), kind: 'assignment', title: a.title, max: 10 })),
    ...quizzes.map((q) => ({ id: q._id.toString(), kind: 'quiz', title: q.title, max: q.questions?.length ?? null })),
  ];

  // index: `${kind}:${assessmentId}:${studentId}` → cell
  const cell = new Map();
  subs.forEach((s) => cell.set(`assignment:${s.assignmentId}:${s.studentId}`, { status: s.status, score: s.score }));
  attempts.forEach((a) => cell.set(`quiz:${a.quizId}:${a.studentId}`, { status: 'graded', score: a.score, max: a.total }));

  const rows = (batch.studentIds || []).map((st) => {
    const cells = columns.map((c) => cell.get(`${c.kind}:${c.id}:${st._id}`) || { status: 'pending', score: null });
    const pcts = cells
      .map((cv, i) => (columns[i].max && cv.score != null ? (cv.score / columns[i].max) * 100 : null))
      .filter((v) => v != null);
    return {
      studentId: st._id, name: st.fullName || st.email, email: st.email,
      cells,
      avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    };
  });

  res.json({ batch: { id: batch._id, name: batch.name }, columns, rows });
});

export default router;
