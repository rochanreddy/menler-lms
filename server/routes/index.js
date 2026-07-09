import { Router } from 'express';

import authRoutes from './auth.js';
import meRoutes from './me.js';
import programRoutes from './programs.js';

const router = Router();

router.get('/', (_req, res) => res.json({ ok: true, service: 'menler-lms', version: 1 }));

router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/programs', programRoutes);

// Phase 2+ mounts: /batches, /sessions, /attendance, /assignments, /projects,
// /library, /forum, /jobs, /webinars, /admin

export default router;
