import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { Quiz } from '../models/Quiz.js';

const router = Router();

// GET /api/lms/stats/overview — admin platform analytics: headline counts +
// student distribution per batch (for the chart).
router.get('/overview', requireAuth, requireRole('admin'), async (_req, res) => {
  const [students, mentors, batches, programs, quizzes] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'mentor' }),
    Batch.countDocuments(),
    Program.countDocuments(),
    Quiz.countDocuments(),
  ]);
  const batchDocs = await Batch.find().select('name studentIds').sort({ createdAt: -1 });
  const perBatch = batchDocs.map((b) => ({ name: b.name.replace(/^Demo — /, ''), count: b.studentIds.length }));
  res.json({ stats: { students, mentors, batches, programs, quizzes }, perBatch });
});

export default router;
