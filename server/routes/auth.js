import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import { User, ROLES } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/token.js';
import { isMailConfigured, sendMail } from '../utils/email.js';
import { invalidateUser, requireAuth } from '../middleware/auth.js';
import { hashPassword, needsRehash } from '../utils/password.js';
import {
  SESSION_MODE,
  liveSessions,
  loadSession,
  openSession,
  readDeviceId,
  revokeOtherSessions,
  revokeSession,
  revokedMessage,
} from '../utils/sessions.js';
import { releaseLease } from '../utils/playback.js';

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
    // A brand-new account has nothing to take over, so this opens a session
    // without any of login's warn/revoke dance.
    const session = await openSession(user, req);
    return res.status(201).json({
      user: user.toPublic(),
      accessToken: signAccessToken(user, session.sid),
      refreshToken: signRefreshToken(user, session.sid),
    });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Could not register.' });
  }
});

// POST /api/lms/auth/login
router.post('/login', async (req, res) => {
  try {
    // 15, not 10: a sign-in is now legitimately two attempts whenever the
    // account is live elsewhere — one that comes back "used on another device"
    // and one that confirms the takeover — so the old ceiling was sized for
    // fewer than one sign-in per user. Fifteen bcrypt compares a minute from a
    // single IP is still nothing, and the CPU-exhaustion case this guards
    // against needs orders of magnitude more.
    if (!rateLimit(`login:${req.ip}`, 15, 60_000)) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
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
    // ── Single active session ──────────────────────────────────────────────
    // An LMS seat is one person's. Before minting tokens, look at whether this
    // account is already being used somewhere else and either say so (default)
    // or take the other device over — see utils/sessions.js for the modes.
    // The caller's own device never counts as "somewhere else", so signing in
    // again in the same browser is always silent.
    if (SESSION_MODE !== 'off' && !req.body?.force) {
      const others = await liveSessions(user._id, { excludeDeviceId: readDeviceId(req) });
      if (others.length && SESSION_MODE === 'warn') {
        return res.status(409).json({
          error: 'This account is currently being used on another device.',
          code: 'session_active',
          device: others[0].deviceLabel,
          last_seen_at: others[0].lastSeenAt,
          // The client re-posts the same credentials with force:true when the
          // user confirms they want to take over.
          hint: 'Sign in here to sign that device out.',
        });
      }
    }

    const session = await openSession(user, req);
    if (SESSION_MODE !== 'off') {
      // Everything else this account had open closes now. Its next request —
      // and its next video heartbeat — gets a 401 explaining why.
      await revokeOtherSessions(user._id, session.sid, { reason: 'superseded', by: session.deviceLabel });
      await releaseLease(user._id); // never leave the old device holding the watch lock
    }

    return res.json({
      user: user.toPublic(),
      accessToken: signAccessToken(user, session.sid),
      refreshToken: signRefreshToken(user, session.sid),
      session: { device: session.deviceLabel },
    });
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

  // A refresh must not be a way around the single-session rule: if the session
  // this token was minted by has been taken over, the refresh dies with it.
  let sid = payload.sid;
  if (sid) {
    const session = await loadSession(sid);
    if (!session || session.revokedAt) {
      return res.status(401).json({
        error: revokedMessage(session),
        code: 'session_revoked',
        reason: session?.revokedReason || 'revoked',
      });
    }
  } else {
    // A refresh token from before sessions existed. Adopt it into one now
    // rather than leaving it permanently exempt from the rule — this is what
    // completes the migration, one device at a time, with no mass logout.
    const session = await openSession(user, req);
    sid = session.sid;
    if (SESSION_MODE === 'strict') {
      await revokeOtherSessions(user._id, sid, { reason: 'superseded', by: session.deviceLabel });
    }
  }

  // The refresh token is not rotated (see client/src/api.js) — it keeps the
  // sid it already carried. The one exception is the legacy token adopted
  // above: it has to be replaced, or every refresh would mint another session.
  return res.json({
    accessToken: signAccessToken(user, sid),
    ...(payload.sid ? {} : { refreshToken: signRefreshToken(user, sid) }),
    user: user.toPublic(),
  });
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
      if (isMailConfigured()) await sendMail({ to: email, subject: 'Reset your Menler LMS password', text: `Reset your password:\n\n${link}\n\nExpires in 30 minutes.` });
      else console.log('[forgot] mail off, reset link:', link);
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
    // The version bump alone already stops every issued token verifying; this
    // closes the session rows too, so the device list matches reality and the
    // signed-out device is told a password change is why.
    await revokeOtherSessions(user._id, null, { reason: 'password_reset' });
    await releaseLease(user._id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('reset error:', err);
    return res.status(500).json({ error: 'Could not reset password.' });
  }
});

// ── Signed-in devices ───────────────────────────────────────────────────────
// A user can see where their account is signed in and close any of it. With
// single-session enforcement on there is normally exactly one row here, which
// is itself the useful thing to be able to check.

// GET /api/lms/auth/sessions — this account's sessions, live one first.
router.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await liveSessions(req.user._id);
  res.json({
    mode: SESSION_MODE,
    // Which row is the caller — the UI marks it "This device" rather than
    // offering to sign you out of the browser you are reading it in.
    current: req.deviceSession?.sid || null,
    sessions: sessions.map((s) => ({ ...s.toPublic(), current: s.sid === req.deviceSession?.sid })),
  });
});

// POST /api/lms/auth/logout — close this session (or all of them).
router.post('/logout', requireAuth, async (req, res) => {
  if (req.body?.all) {
    await revokeOtherSessions(req.user._id, null, { reason: 'logout' });
  } else if (req.deviceSession?.sid) {
    await revokeSession(req.deviceSession.sid, 'logout');
  }
  // Whoever was watching is being signed out, so the lock has to come with it —
  // otherwise the account is locked out of video until the lease goes stale.
  await releaseLease(req.user._id);
  res.json({ ok: true });
});

// POST /api/lms/auth/sessions/revoke { sid } — sign one other device out.
router.post('/sessions/revoke', requireAuth, async (req, res) => {
  const sid = String(req.body?.sid || '');
  const target = sid ? await loadSession(sid) : null;
  // Scoped to your own sessions: a sid is unguessable, but "unguessable" is
  // not an access rule.
  if (!target || String(target.userId) !== String(req.user._id)) {
    return res.status(404).json({ error: 'That device is not signed in to this account.' });
  }
  await revokeSession(sid, 'revoked', req.deviceSession?.deviceLabel || '');
  await releaseLease(req.user._id, sid);
  res.json({ ok: true });
});

export default router;
