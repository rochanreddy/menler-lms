import { PlaybackLease } from '../models/PlaybackLease.js';

// One watcher per account, enforced by the single row in models/PlaybackLease.js.
//
// Two devices can be signed in at once in some configurations (see
// LMS_SINGLE_SESSION in utils/sessions.js), and two tabs of the same browser
// always can. Playback is the thing actually worth paying for, so it gets its
// own lock either way.

// A lease is only as good as its last heartbeat. The client renews every 20s;
// three misses (a closed laptop lid, a dead tab, a train tunnel) hands the lock
// to whoever asks next, which is short enough not to strand a student and long
// enough to ride out a bad connection.
export const LEASE_TTL_MS = 70 * 1000;

const staleBefore = () => new Date(Date.now() - LEASE_TTL_MS);

/** Whatever is currently held for this user, stale rows included. */
export const currentLease = (userId) => PlaybackLease.findById(userId);

/**
 * Claim (or renew) the watch lock.
 *
 * Returns { ok: true, lease } when this session may play, or
 * { ok: false, lease } naming the device that already holds it.
 *
 * `takeover` is the student clicking "watch here instead": it seizes a live
 * lease, and the losing device finds out on its next heartbeat.
 */
export async function claimLease(userId, { sid, deviceLabel, videoKey, title, takeover = false }) {
  const now = new Date();
  const set = { sid, deviceLabel, videoKey, title, heartbeatAt: now };

  // Only ever match a lease we are allowed to take: our own, an abandoned one,
  // or — on takeover — any of them. The filter is the lock; nothing here reads
  // the row first and then decides, because two devices would read the same
  // "free" and both proceed.
  const filter = takeover
    ? { _id: userId }
    : { _id: userId, $or: [{ sid }, { heartbeatAt: { $lte: staleBefore() } }] };

  try {
    const lease = await PlaybackLease.findOneAndUpdate(
      filter,
      { $set: set, $setOnInsert: { startedAt: now } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return { ok: true, lease };
  } catch (err) {
    // 11000 means the upsert tried to insert while a row already existed —
    // i.e. the filter did not match, so somebody else holds a live lease.
    // That is the answer, not a failure.
    if (err?.code !== 11000) throw err;
    return { ok: false, lease: await currentLease(userId) };
  }
}

/** Renew a lease this session already holds. False once it has been taken. */
export async function renewLease(userId, sid) {
  const lease = await PlaybackLease.findOneAndUpdate(
    { _id: userId, sid },
    { $set: { heartbeatAt: new Date() } },
    { new: true },
  );
  return !!lease;
}

/**
 * Drop the lock.
 *
 * With a sid, only that session's lease is dropped — a device signing out must
 * never yank the lock from the one that took over from it. With no sid (a
 * takeover at login, a password reset) the row goes whoever holds it.
 */
export async function releaseLease(userId, sid) {
  await PlaybackLease.deleteOne(sid ? { _id: userId, sid } : { _id: userId });
}

/** Is this lease still being heartbeaten? */
export const isLive = (lease) => !!lease && lease.heartbeatAt > staleBefore();
