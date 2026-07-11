import { Router } from 'express';

import authRoutes from './auth.js';
import meRoutes from './me.js';
import programRoutes from './programs.js';
import userRoutes from './users.js';
import batchRoutes from './batches.js';
import sessionRoutes from './sessions.js';
import attendanceRoutes from './attendance.js';
import assignmentRoutes from './assignments.js';
import submissionRoutes from './submissions.js';
import quizRoutes from './quizzes.js';
import forumRoutes from './forum.js';
import libraryRoutes from './library.js';
import webinarRoutes from './webinars.js';
import statsRoutes from './stats.js';

const router = Router();

router.get('/', (_req, res) => res.json({ ok: true, service: 'menler-lms', version: 2 }));

// Phase 1
router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/programs', programRoutes);

// Phase 2
router.use('/users', userRoutes);
router.use('/batches', batchRoutes);
router.use('/sessions', sessionRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/submissions', submissionRoutes);
router.use('/quizzes', quizRoutes);
router.use('/forum', forumRoutes);
router.use('/library', libraryRoutes);
router.use('/webinars', webinarRoutes);
router.use('/stats', statsRoutes);

// Phase 3+ : /jobs

export default router;
