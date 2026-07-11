import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { canAccessBatch, isMentorOfBatch, myBatchIds } from '../utils/access.js';

const router = Router();

// GET /api/lms/quizzes?batchId=..  OR  ?scope=mine
// Mentors/admins see full quizzes (with answers). Students see answer-stripped
// quizzes, each with their own attempt (if any) attached.
router.get('/', requireAuth, async (req, res) => {
  const { batchId, scope } = req.query;
  let filter;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
  } else {
    filter = { batchId: { $in: await myBatchIds(req.user) } };
  }
  const quizzes = await Quiz.find(filter).populate('batchId', 'name').sort({ createdAt: -1 });

  if (req.user.role === 'student' || scope === 'mine') {
    const attempts = await QuizAttempt.find({ studentId: req.user._id, quizId: { $in: quizzes.map((q) => q._id) } });
    const byId = new Map(attempts.map((a) => [a.quizId.toString(), a]));
    return res.json({
      quizzes: quizzes.map((q) => ({ ...q.forStudent(), batchId: q.batchId, myAttempt: byId.get(q._id.toString()) || null })),
    });
  }
  res.json({ quizzes });
});

// GET /api/lms/quizzes/:id — student gets answer-stripped; mentor gets full.
router.get('/:id', requireAuth, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!(await canAccessBatch(req.user, quiz.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  if (req.user.role === 'student') {
    const myAttempt = await QuizAttempt.findOne({ quizId: quiz._id, studentId: req.user._id });
    return res.json({ quiz: quiz.forStudent(), myAttempt });
  }
  res.json({ quiz });
});

// POST /api/lms/quizzes — mentor of the batch (or admin) creates a quiz/exam.
router.post('/', requireAuth, async (req, res) => {
  const { batchId, title, type, questions } = req.body || {};
  if (!batchId || !title) return res.status(400).json({ error: 'batchId and title are required.' });
  if (!(await isMentorOfBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const quiz = await Quiz.create({
    batchId,
    title,
    type: type === 'exam' ? 'exam' : 'quiz',
    questions: (Array.isArray(questions) ? questions : []).map((q) => ({
      text: q.text || '', options: Array.isArray(q.options) ? q.options : [], correctIndex: Number(q.correctIndex) || 0,
    })),
  });
  res.status(201).json({ quiz });
});

// POST /api/lms/quizzes/:id/attempt  { answers: [idx,...] } — student attempts once.
router.post('/:id/attempt', requireAuth, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!(await canAccessBatch(req.user, quiz.batchId))) return res.status(403).json({ error: 'You are not in this batch.' });
  if (await QuizAttempt.findOne({ quizId: quiz._id, studentId: req.user._id })) {
    return res.status(409).json({ error: 'You have already attempted this quiz.' });
  }
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const score = quiz.questions.reduce((s, q, i) => s + (answers[i] === q.correctIndex ? 1 : 0), 0);
  const attempt = await QuizAttempt.create({ quizId: quiz._id, studentId: req.user._id, answers, score, total: quiz.questions.length });
  res.status(201).json({ attempt });
});

// GET /api/lms/quizzes/:id/results — mentor/admin sees all attempts.
router.get('/:id/results', requireAuth, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
  if (!(await isMentorOfBatch(req.user, quiz.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const attempts = await QuizAttempt.find({ quizId: quiz._id }).populate('studentId', 'fullName email').sort({ score: -1 });
  res.json({ quiz: { _id: quiz._id, title: quiz.title, total: quiz.questions.length }, attempts });
});

export default router;
