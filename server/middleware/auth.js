import { User, ROLES } from '../models/User.js';
import { verifyToken } from '../utils/token.js';
import { loadSession, revokedMessage, touchSession } from '../utils/sessions.js';

// ── Signed-in user cache ────────────────────────────────────────────────────
//
// requireAuth runs on every authenticated request, and it used to read the user
// from Mongo every single time. That made one query the most-issued operation in
// the whole app -- roughly a third of all database traffic, and the largest
// single line item against the Atlas free tier's 100 ops/sec ceiling.
//
// Correctness is preserved two ways rather than one:
//
//   1. Only GET requests are served from the cache. Anything that might write
//      (me.js mutates req.user and saves it) always re-reads, so a route can
//      never mutate a document another request is holding, and a failed save can
//      never leave a dirty user in memory. The polling endpoints that caused the
//      problem -- the notification bell, the doubts board, every dashboard load
//      -- are all GETs, so this keeps essentially all of the benefit.
//
//   2. invalidateUser() drops an entry the moment that user's document is
//      written. Every route that saves a User calls it, so an admin block still
//      takes effect on the very next request exactly as it did before.
//
// The TTL is the backstop for anything those two miss, not the primary guard.
const TTL_MS = 30_000;
const cache = new Map(); // userId -> { user, expires }

// A dashboard mount fires eight requests at once. On a cold cache all eight
// would miss together and issue eight identical lookups, which is exactly the
// burst that breaches the ops/sec ceiling. Share one in-flight query instead.
const pending = new Map(); // userId -> Promise<User|null>

/** Drop a cached user. Call this after ANY write to that user's document. */
export function invalidateUser(id) {
  if (id) cache.delete(String(id));
}

// Only signed-in users are ever held, so this stays small -- but sweep expired
// entries anyway so it cannot grow without bound as the cohort does.
let lastSweep = 0;
function sweep(now) {
  for (const [id, entry] of cache) if (entry.expires <= now) cache.delete(id);
  lastSweep = now;
}

/** Reads the Bearer token, loads the user, or null. */
async function getUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub || payload.typ !== 'access') return null;
  // requireAuth needs the sid claim to check the session is still open; this
  // is the only place the token is parsed, so it is handed on from here.
  req.token = payload;

  const id = String(payload.sub);
  const now = Date.now();
  const readOnly = req.method === 'GET';

  // A token's tokenVersion claim is fixed at sign time; the user's current
  // value moves the moment their password is reset. Missing claim/field both
  // read as 0, so tokens already out there when this shipped keep working
  // until an actual reset happens — not a forced mass-logout on deploy.
  const sameVersion = (user) => (user && (payload.tokenVersion ?? 0) === (user.tokenVersion ?? 0) ? user : null);

  if (readOnly) {
    const hit = cache.get(id);
    if (hit && hit.expires > now) return sameVersion(hit.user);
    const inFlight = pending.get(id);
    if (inFlight) return inFlight.then(sameVersion); // a sibling request is already fetching this user
  }

  const query = User.findById(id)
    .then((user) => {
      if (user) {
        cache.set(id, { user, expires: Date.now() + TTL_MS });
        if (now - lastSweep > TTL_MS) sweep(now);
      }
      return user;
    })
    .finally(() => pending.delete(id));

  // Writes never share a document: each gets its own instance to mutate.
  if (readOnly) pending.set(id, query);
  return query.then(sameVersion);
}

// Only re-stamp lastActiveAt this often — otherwise every request is a write.
const ACTIVITY_THROTTLE_MS = 15 * 60 * 1000;

/** Express guard — 401s without a valid access token. */
export async function requireAuth(req, res, next) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });

  // Accounts with a retired/unknown role (e.g. legacy 'partner') have no
  // access anywhere — reject at the chokepoint rather than in every route.
  if (!ROLES.includes(user.role)) {
    return res.status(403).json({ error: 'Your account role no longer has access.', code: 'blocked' });
  }

  // Admin-blocked accounts are locked out of every endpoint. The block route
  // invalidates this user's cache entry as it saves, so this still reads a
  // current document and a block still lands on the very next request.
  // Admins themselves are never blockable.
  if (user.role !== 'admin' && user.blocked?.lms) {
    return res.status(403).json({
      error: user.blocked?.reason
        ? `Your account has been blocked: ${user.blocked.reason}`
        : 'Your account has been blocked by the administrator.',
      code: 'blocked',
    });
  }
  // ── Single active session ────────────────────────────────────────────────
  // Signing in on a second device closes this account's other sessions, and
  // this is where that lands: the token still verifies, but the row that
  // minted it has been revoked, so it is no longer a way in. Checked after the
  // block/role gates so an account that is both blocked and superseded is told
  // about the block, which is the more important of the two.
  //
  // A token with no sid predates sessions (see utils/token.js) — it is allowed
  // through and adopted into a session on its next refresh, rather than being
  // turned into a mass logout on the deploy that shipped this.
  if (req.token?.sid) {
    const session = await loadSession(req.token.sid);
    if (!session || session.revokedAt) {
      return res.status(401).json({
        error: revokedMessage(session),
        code: 'session_revoked',
        reason: session?.revokedReason || 'revoked',
      });
    }
    req.deviceSession = session;
    touchSession(session);
  }

  req.user = user;

  // Fire-and-forget last-seen tracking: never blocks or fails the request.
  // Stamping the in-memory document too means a cache hit won't re-fire this.
  if (Date.now() - (user.lastActiveAt?.getTime() || 0) > ACTIVITY_THROTTLE_MS) {
    const at = new Date();
    user.lastActiveAt = at;
    User.updateOne({ _id: user._id }, { $set: { lastActiveAt: at } }).catch(() => {});
  }

  next();
}

/**
 * Role gate — use AFTER requireAuth:
 *   router.post('/programs', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role.' });
    }
    next();
  };
}
