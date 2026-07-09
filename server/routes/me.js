import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/lms/me — the frontend calls this on load to pick which dashboard
// (student/mentor/admin/partner) to render.
router.get('/', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

// PATCH /api/lms/me — update own Profile tab.
router.patch('/', requireAuth, async (req, res) => {
  const u = req.user;
  const { fullName, phone, education, professional, resumeUrl } = req.body || {};
  if (fullName !== undefined) u.fullName = fullName;
  if (phone !== undefined) u.phone = phone;
  if (education !== undefined) u.education = education;
  if (professional !== undefined) u.professional = professional;
  if (resumeUrl !== undefined) u.resumeUrl = resumeUrl;
  await u.save();
  res.json({ user: u.toPublic() });
});

export default router;
