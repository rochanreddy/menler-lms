import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { claimLease, currentLease, isLive, releaseLease, renewLease, LEASE_TTL_MS } from '../utils/playback.js';

// The watch lock, as three calls the player makes: claim before playing, renew
// while playing, release when it stops. See utils/playback.js for why the lock
// exists on top of the single-session rule rather than instead of it.

const router = Router();

/** 409 body for "someone else is watching". Same shape everywhere. */
export function busyBody(lease) {
  return {
    error: 'This account is currently being used on another device.',
    code: 'playback_busy',
    device: lease?.deviceLabel || 'another device',
    title: lease?.title || '',
    since: lease?.startedAt || null,
  };
}

// The lease is held by the session, so a request with a legacy (sid-less)
// token has nothing to hold it with. Fall back to the user id: such a token
// is one device by definition until it refreshes into a real session.
const holderSid = (req) => req.deviceSession?.sid || `legacy:${req.user._id}`;
const holderLabel = (req) => req.deviceSession?.deviceLabel || 'another device';

// POST /api/lms/playback/claim { videoKey, title, takeover }
router.post('/claim', requireAuth, async (req, res) => {
  const { ok, lease } = await claimLease(req.user._id, {
    sid: holderSid(req),
    deviceLabel: holderLabel(req),
    videoKey: String(req.body?.videoKey || ''),
    title: String(req.body?.title || '').slice(0, 200),
    takeover: !!req.body?.takeover,
  });
  if (!ok) return res.status(409).json(busyBody(lease));
  res.json({ ok: true, ttl_ms: LEASE_TTL_MS, since: lease?.startedAt || null });
});

// POST /api/lms/playback/heartbeat — renew. A 409 here means the lease was
// taken while this device was playing, which is the player's cue to stop.
router.post('/heartbeat', requireAuth, async (req, res) => {
  if (await renewLease(req.user._id, holderSid(req))) return res.json({ ok: true, ttl_ms: LEASE_TTL_MS });
  return res.status(409).json(busyBody(await currentLease(req.user._id)));
});

/**
 * A closing tab releases the lock with navigator.sendBeacon, which cannot set
 * an Authorization header — so on this route only, a token in the body counts
 * as one. It is the same Bearer token requireAuth would have read from the
 * header and is verified identically; nothing here trusts the body itself.
 */
function beaconAuth(req, _res, next) {
  if (!req.headers.authorization && req.body?.token) req.headers.authorization = `Bearer ${req.body.token}`;
  next();
}

// POST /api/lms/playback/release — scoped to this session's own lease, so a
// device that has already lost the lock cannot release the winner's.
router.post('/release', beaconAuth, requireAuth, async (req, res) => {
  await releaseLease(req.user._id, holderSid(req));
  res.json({ ok: true });
});

// GET /api/lms/playback — who holds the lock, if anyone. Read-only; used to
// render the "watching elsewhere" state without trying to take the lock.
router.get('/', requireAuth, async (req, res) => {
  const lease = await currentLease(req.user._id);
  if (!isLive(lease)) return res.json({ watching: null });
  res.json({
    watching: {
      device: lease.deviceLabel,
      title: lease.title,
      video_key: lease.videoKey,
      since: lease.startedAt,
      mine: lease.sid === holderSid(req),
    },
  });
});

export default router;
