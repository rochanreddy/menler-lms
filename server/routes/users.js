import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { User, ROLES } from '../models/User.js';

const router = Router();

// GET /api/lms/users?role=mentor&search=foo — admin lists/searches users.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const q = {};
  if (req.query.role) q.role = req.query.role;
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).trim(), 'i');
    q.$or = [{ email: rx }, { fullName: rx }];
  }
  const users = await User.find(q).sort({ createdAt: -1 }).limit(200);
  res.json({ users: users.map((u) => u.toPublic()) });
});

// POST /api/lms/users — admin provisions a mentor / partner / student. Returns a
// generated temp password if none was supplied (so admin can share it).
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, fullName, phone, role = 'mentor', password } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  const clean = String(email).toLowerCase().trim();
  if (await User.findOne({ email: clean })) return res.status(409).json({ error: 'That email already exists.' });

  const temp = password || crypto.randomBytes(6).toString('hex');
  const user = await User.create({
    email: clean,
    fullName: fullName || '',
    phone: phone || '',
    role,
    passwordHash: await bcrypt.hash(temp, 12),
  });
  res.status(201).json({ user: user.toPublic(), tempPassword: password ? undefined : temp });
});

export default router;
