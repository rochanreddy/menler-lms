import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/lms/me — the frontend calls this on load to pick which dashboard
// (student/mentor/admin/partner) to render.
router.get('/', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

// PATCH /api/lms/me/password — any logged-in user changes their own password
// (e.g. a mentor swapping the temp password the admin gave them).
router.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const u = req.user;
  const ok = u.passwordHash && (await bcrypt.compare(String(currentPassword || ''), u.passwordHash));
  if (!ok) return res.status(400).json({ error: 'Current password is incorrect.' });
  u.passwordHash = await bcrypt.hash(String(newPassword), 12);
  await u.save();
  res.json({ ok: true });
});

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
