import { User } from '../models/User.js';
import { verifyToken } from '../utils/token.js';

/** Reads the Bearer token, loads the user, or null. */
async function getUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub || payload.typ !== 'access') return null;
  return User.findById(payload.sub);
}

/** Express guard — 401s without a valid access token. */
export async function requireAuth(req, res, next) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  req.user = user;
  next();
}

/**
 * Role gate — use AFTER requireAuth:
 *   router.post('/programs', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden — insufficient role.' });
    }
    next();
  };
}
