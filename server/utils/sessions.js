import crypto from 'crypto';

import { DeviceSession } from '../models/DeviceSession.js';

// Single active session, in one place. Both the login route and the auth
// chokepoint go through here so the rule cannot be enforced two slightly
// different ways.

/**
 * How the takeover behaves, via LMS_SINGLE_SESSION:
 *
 *   'warn'   (default) a sign-in while another device is still live is refused
 *            with 409 + code 'session_active', so the user is told rather than
 *            silently kicking their other device. Re-posting with force:true
 *            takes over.
 *   'strict' the newest sign-in always wins, no prompt.
 *   'off'    sessions are still recorded (so the device list and the playback
 *            lease work), but an older one is never revoked.
 */
export const SESSION_MODE = (() => {
  const raw = String(process.env.LMS_SINGLE_SESSION || 'warn').toLowerCase();
  return ['warn', 'strict', 'off'].includes(raw) ? raw : 'warn';
})();

// A session counts as "currently in use" for this long after its last request.
// requireAuth only re-stamps lastSeenAt every 15 minutes (writing on every
// request would cost more than the feature is worth), so this has to be wider
// than that throttle or a genuinely active device would look idle.
export const LIVE_WINDOW_MS = 20 * 60 * 1000;

const newSid = () => crypto.randomBytes(24).toString('hex');

/** "Chrome on Windows" — enough for someone to recognise their own device. */
export function describeDevice(userAgent = '') {
  const ua = String(userAgent);
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    // Safari ships "Safari" in every Chromium UA too, so it is only Safari
    // once the others have been ruled out.
    : /Safari\//.test(ua) ? 'Safari'
    : '';
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || 'Unknown device';
}

/** Sessions for this user that are neither revoked nor idle past the window. */
export function liveSessions(userId, { excludeDeviceId = '' } = {}) {
  const filter = {
    userId,
    revokedAt: null,
    lastSeenAt: { $gt: new Date(Date.now() - LIVE_WINDOW_MS) },
  };
  // Re-signing in on the same browser is a renewal, not a second device — it
  // must never prompt the user about themselves.
  if (excludeDeviceId) filter.deviceId = { $ne: excludeDeviceId };
  return DeviceSession.find(filter).sort({ lastSeenAt: -1 });
}

/**
 * Revoke every live session for a user except `keepSid`.
 * Returns how many were closed.
 */
export async function revokeOtherSessions(userId, keepSid, { reason = 'superseded', by = '' } = {}) {
  const filter = { userId, revokedAt: null };
  if (keepSid) filter.sid = { $ne: keepSid };
  const res = await DeviceSession.updateMany(filter, {
    $set: { revokedAt: new Date(), revokedReason: reason, revokedBy: by },
  });
  invalidateSession(); // the sid→row cache can no longer be trusted for anyone
  return res.modifiedCount || 0;
}

/** Close one session by sid (sign out, or an admin revoking a device). */
export async function revokeSession(sid, reason = 'logout', by = '') {
  if (!sid) return;
  await DeviceSession.updateOne(
    { sid, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason, revokedBy: by } },
  );
  invalidateSession(sid);
}

/**
 * Open a session for this sign-in.
 *
 * Signing in again on a device we already know replaces that device's row
 * rather than stacking a second one, so the device list stays a list of
 * devices instead of a list of sign-ins.
 */
export async function openSession(user, req) {
  const deviceId = readDeviceId(req);
  const userAgent = String(req.get('user-agent') || '').slice(0, 300);
  const sid = newSid();
  const doc = {
    userId: user._id,
    sid,
    deviceId,
    deviceLabel: describeDevice(userAgent),
    userAgent,
    ip: req.ip || '',
    lastSeenAt: new Date(),
    revokedAt: null,
    revokedReason: '',
    revokedBy: '',
  };

  if (deviceId) {
    await DeviceSession.findOneAndUpdate({ userId: user._id, deviceId }, doc, { upsert: true, new: true });
  } else {
    await DeviceSession.create(doc);
  }
  invalidateSession();
  return { sid, deviceLabel: doc.deviceLabel, deviceId };
}

/** The client's stable per-browser id, scrubbed — it ends up in log lines. */
export function readDeviceId(req) {
  return String(req.get('x-device-id') || '').replace(/[^\w.-]/g, '').slice(0, 64);
}

// ── sid → session cache ─────────────────────────────────────────────────────
//
// requireAuth already caches the User to keep Mongo's ops/sec down (see
// middleware/auth.js); looking a session up on every request would put the
// query it removed straight back. Same shape, same TTL, same guarantee: every
// write to a session calls invalidateSession(), and the TTL is only the
// backstop for anything that misses (another instance, chiefly).
const TTL_MS = 30_000;
const cache = new Map(); // sid -> { session, expires }
const pending = new Map(); // sid -> Promise<DeviceSession|null>

/** Drop one cached session, or all of them when called with no argument. */
export function invalidateSession(sid) {
  if (sid) cache.delete(String(sid));
  else cache.clear();
}

/** The session row for a sid, cached. Null when there has never been one. */
export function loadSession(sid) {
  const key = String(sid);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.session);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const query = DeviceSession.findOne({ sid: key })
    .then((session) => {
      if (session) cache.set(key, { session, expires: Date.now() + TTL_MS });
      return session;
    })
    .finally(() => pending.delete(key));
  pending.set(key, query);
  return query;
}

// Only re-stamp a session's lastSeenAt this often — matches the lastActiveAt
// throttle in middleware/auth.js, for the same reason.
export const SEEN_THROTTLE_MS = 15 * 60 * 1000;

/** Fire-and-forget activity stamp. Never blocks or fails a request. */
export function touchSession(session) {
  if (!session) return;
  if (Date.now() - (session.lastSeenAt?.getTime() || 0) < SEEN_THROTTLE_MS) return;
  const at = new Date();
  session.lastSeenAt = at; // so a cache hit doesn't re-fire this
  DeviceSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: at } }).catch(() => {});
}

/** The message the taken-over device is shown. */
export function revokedMessage(session) {
  const where = session?.revokedBy ? ` on ${session.revokedBy}` : ' on another device';
  switch (session?.revokedReason) {
    case 'superseded':
      return `You were signed out because this account was used${where}. Only one device can be signed in at a time.`;
    case 'password_reset':
      return 'You were signed out because this account’s password was changed.';
    case 'blocked':
      return 'Your account has been blocked by the administrator.';
    case 'logout':
      return 'This session has been signed out.';
    default:
      return 'This session was signed out from another device.';
  }
}
