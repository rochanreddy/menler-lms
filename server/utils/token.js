import jwt from 'jsonwebtoken';

// Stateless Bearer tokens (Authorization: Bearer <token>). The LMS frontend
// stores the access token and sends it on every request.
const SECRET = process.env.JWT_SECRET || 'dev-insecure-lms-secret-change-me';
const ACCESS_TTL = '2h';
const REFRESH_TTL = '30d';

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, typ: 'access' }, SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: user._id.toString(), typ: 'refresh' }, SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
