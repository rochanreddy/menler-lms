import jwt from 'jsonwebtoken';

// Stateless Bearer tokens (Authorization: Bearer <token>). The LMS frontend
// stores the access token and sends it on every request.
// Fail loudly rather than quietly signing with a secret that is published in
// this repo: a missing JWT_SECRET in production would let anyone mint an admin
// token, and the server would look perfectly healthy while they did it.
const SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set. Refusing to start with a known signing key.');
  }
  console.warn('[auth] JWT_SECRET unset, using the insecure dev key. Never run this in production.');
  return 'dev-insecure-lms-secret-change-me';
})();
const ACCESS_TTL = '8h';
const REFRESH_TTL = '30d';

// Both token types carry the id of the session that minted them (`sid`, see
// models/DeviceSession.js). That claim is what makes a stateless token
// revocable: requireAuth refuses a token whose session row has been closed, so
// signing in on a second device signs the first one out on its very next
// request instead of whenever its 8h access token happens to expire.
//
// The claim is optional on purpose. Tokens issued before sessions existed
// carry none, and are treated as an un-tracked session rather than rejected —
// a deploy must not log the whole cohort out. They pick up a session on their
// next refresh (see routes/auth.js), so the migration completes within 8h.
export function signAccessToken(user, sid) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, typ: 'access', tokenVersion: user.tokenVersion ?? 0, ...(sid ? { sid } : {}) },
    SECRET,
    { expiresIn: ACCESS_TTL },
  );
}

export function signRefreshToken(user, sid) {
  return jwt.sign(
    { sub: user._id.toString(), typ: 'refresh', tokenVersion: user.tokenVersion ?? 0, ...(sid ? { sid } : {}) },
    SECRET,
    { expiresIn: REFRESH_TTL },
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
