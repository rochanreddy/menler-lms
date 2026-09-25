import { Router } from 'express';

import authRoutes from './auth.js';
import meRoutes from './me.js';
import programRoutes from './programs.js';
import userRoutes from './users.js';
import batchRoutes from './batches.js';
import sessionRoutes from './sessions.js';
import attendanceRoutes from './attendance.js';
import reviewRoutes from './reviews.js';
import assignmentRoutes from './assignments.js';
import submissionRoutes from './submissions.js';
import quizRoutes from './quizzes.js';
import forumRoutes from './forum.js';
import libraryRoutes from './library.js';
import webinarRoutes from './webinars.js';
import statsRoutes from './stats.js';
import uploadRoutes from './uploads.js';
import zoomRoutes from './zoom.js';
import progressRoutes from './progress.js';
import notificationRoutes from './notifications.js';
import announcementRoutes from './announcements.js';
import doubtSessionRoutes from './doubtSessions.js';
import gradeRoutes from './grades.js';
import searchRoutes from './search.js';
import reportRoutes from './reports.js';
import lessonVideoRoutes from './lessonVideos.js';
import playbackRoutes from './playback.js';
import supportRoutes from './support.js';
import mailRoutes from './mail.js';
import certificateRoutes from './certificates.js';
import jobRoutes from './jobs.js';

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
router.use('/reviews', reviewRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/submissions', submissionRoutes);
router.use('/quizzes', quizRoutes);
router.use('/forum', forumRoutes);
router.use('/library', libraryRoutes);
router.use('/webinars', webinarRoutes);
router.use('/stats', statsRoutes);
router.use('/uploads', uploadRoutes);
router.use('/zoom', zoomRoutes); // public webhook (signature-verified)
router.use('/progress', progressRoutes);
// /certificates/verify/:code is public — a credential nobody can check
// without an account is not a credential. See the file for what that exposes.
router.use('/certificates', certificateRoutes);
router.use('/notifications', notificationRoutes);
router.use('/announcements', announcementRoutes);
router.use('/doubt-sessions', doubtSessionRoutes); // slot-booked doubt clearing, admin-announced
router.use('/grades', gradeRoutes);
router.use('/search', searchRoutes); // universal ⌘K search across everything you can see
router.use('/reports', reportRoutes); // admin CSV exports
router.use('/lesson-videos', lessonVideoRoutes); // VdoCipher video ↔ lesson, per batch
router.use('/playback', playbackRoutes); // the one-device-at-a-time watch lock
router.use('/support', supportRoutes); // student help desk, answered by the admin
router.use('/mail', mailRoutes); // admin mail templates + batch-wise scheduled sends
router.use('/jobs', jobRoutes); // the curated job board: 300 postings, students + admin

export default router;
