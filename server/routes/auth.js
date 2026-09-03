import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import { User, ROLES } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/token.js';
import { isSmtpConfigured, sendMail } from '../utils/email.js';
import { invalidateUser } from '../middleware/auth.js';
import { hashPassword, needsRehash } from '../utils/password.js';

const router = Router();

// ── Tiny in-memory rate limiter (per IP+route, or per user where noted) ──
const hits = new Map();
// Expired buckets are dropped on a sweep rather than never — the map is keyed
// by caller, so without this it grows for the life of the process. Same
// opportunistic pattern as the signed-in user cache in middleware/auth.js.
let lastSweep = 0;
const SWEEP_EVERY_MS = 60_000;

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  if (now - lastSweep > SWEEP_EVERY_MS) {
    for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    lastSweep = now;
  }
  const rec = hits.get(key);
  if (!rec || now > rec.reset) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  rec.count += 1;
  return rec.count <= max;
}

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const APP_URL = () => (process.env.LMS_APP_URL || 'http://localhost:5174').replace(/\/+$/, '');

// POST /api/lms/auth/register — self-signup is forced to role=student.
router.post('/register', async (req, res) => {
  try {
    // Unauthenticated and it runs bcrypt at cost 12 on bcryptjs (pure JS, no
    // native binding), so each call buys a few hundred ms of worker CPU —
    // the cheapest way to saturate this service. Signing up is a once-ever
    // action, so 5/min still clears a classroom behind one shared NAT.
    if (!rateLimit(`register:${req.ip}`, 5, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const { email, password, fullName, phone } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const clean = String(email).toLowerCase().trim();
    if (await User.findOne({ email: clean })) return res.status(409).json({ error: 'An account with this email already exists.' });

    const user = await User.create({
      email: clean,
      passwordHash: await hashPassword(password),
      fullName: fullName || '',
      phone: phone || '',
      role: 'student',
    });
    return res.status(201).json({ user: user.toPublic(), accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Could not register.' });
  }
});

// POST /api/lms/auth/login
router.post('/login', async (req, res) => {
  try {
    if (!rateLimit(`login:${req.ip}`, 10, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: String(email || '').toLowerCase().trim() });
    const ok = user && user.passwordHash && (await bcrypt.compare(String(password || ''), user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
    // Retired/unknown roles (e.g. legacy 'partner' accounts) cannot sign in.
    if (!ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'Your account role no longer has access to this portal.' });
    }
    if (user.role !== 'admin' && user.blocked?.lms) {
      return res.status(403).json({
        error: user.blocked?.reason
          ? `Your account has been blocked: ${user.blocked.reason}`
          : 'Your account has been blocked by the administrator.',
        code: 'blocked',
      });
    }
    // Opportunistic re-hash. An account created at the old cost keeps
    // verifying at the old cost — this is the only moment we hold the
    // plaintext and can cheapen it, so a user migrates on their next sign-in
    // and pays the old price exactly once more. Deliberately NOT a
    // tokenVersion bump: the password is unchanged, so signing them out of
    // their other devices would be a gratuitous side effect of an internal
    // storage detail. Best-effort — a failed write must never cost someone a
    // successful login.
    if (needsRehash(user.passwordHash)) {
      try {
        user.passwordHash = await hashPassword(password);
        await user.save();
      } catch (e) {
        console.error('password rehash failed for', String(user._id), '-', e.message);
      }
    }
    return res.json({ user: user.toPublic(), accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Could not log in.' });
  }
});

// POST /api/lms/auth/refresh
router.post('/refresh', async (req, res) => {
  const payload = verifyToken(req.body?.refreshToken);
  if (!payload?.sub || payload.typ !== 'refresh') return res.status(401).json({ error: 'Invalid refresh token.' });
  // Keyed by USER, not IP, and deliberately: a whole cohort on one campus NAT
  // refreshes at the same time each morning, and a 429 here logs them out
  // (see refreshAccessToken in client/src/api.js). Per user, one legitimate
  // refresh every 8h means 20/min is only ever hit by a replay loop.
  if (!rateLimit(`refresh:${payload.sub}`, 20, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
  const user = await User.findById(payload.sub);
  if (!user) return res.status(401).json({ error: 'Invalid refresh token.' });
  // A refresh token signed before a password reset must not be able to mint
  // a fresh access token — that would silently undo the reset's whole point.
  // Missing claim/field both read as 0 (see middleware/auth.js).
  if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    return res.status(401).json({ error: 'Invalid refresh token.' });
  }
  if (!ROLES.includes(user.role)) {
    return res.status(403).json({ error: 'Your account role no longer has access to this portal.' });
  }
  if (user.role !== 'admin' && user.blocked?.lms) {
    return res.status(403).json({ error: 'Your account has been blocked by the administrator.', code: 'blocked' });
  }
  return res.json({ accessToken: signAccessToken(user), user: user.toPublic() });
});

// POST /api/lms/auth/forgot — always returns success (no account enumeration).
router.post('/forgot', async (req, res) => {
  try {
    if (!rateLimit(`forgot:${req.ip}`, 5, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const email = String(req.body?.email || '').toLowerCase().trim();
    const user = await User.findOne({ email });
    if (user) {
      const raw = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = hashToken(raw);
      user.resetExpires = new Date(Date.now() + 1000 * 60 * 30);
      await user.save();
      const link = `${APP_URL()}/reset?token=${raw}&email=${encodeURIComponent(email)}`;
      if (isSmtpConfigured()) await sendMail({ to: email, subject: 'Reset your Menler LMS password', text: `Reset your password:\n\n${link}\n\nExpires in 30 minutes.` });
      else console.log('[forgot] SMTP off, reset link:', link);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('forgot error:', err);
    return res.json({ ok: true });
  }
});

// POST /api/lms/auth/reset
router.post('/reset', async (req, res) => {
  try {
    // Also unauthenticated, also hashes at cost 12 — same CPU vector as
    // /register, and the same 5/min ceiling /forgot already uses.
    if (!rateLimit(`reset:${req.ip}`, 5, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    const { email, token, password } = req.body || {};
    if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const user = await User.findOne({
      email: String(email || '').toLowerCase().trim(),
      resetTokenHash: hashToken(String(token || '')),
      resetExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    user.passwordHash = await hashPassword(password);
    user.resetTokenHash = '';
    user.resetExpires = null;
    // The whole point of a reset is to lock out anyone holding an
    // already-issued token — bump the version so theirs stop verifying.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    invalidateUser(user._id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('reset error:', err);
    return res.status(500).json({ error: 'Could not reset password.' });
  }
});

export default router;
