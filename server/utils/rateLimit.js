import { RateLimit } from '../models/RateLimit.js';

// rateLimit(key, max, windowMs) -> Promise<boolean>   true = allowed
//
// Fixed-window counter shared across instances. The window is bucketed by the
// clock (floor(now / windowMs)) and folded into the key, so a single atomic
// $inc-with-upsert is the whole algorithm: no read-then-decide, no sweep, no
// per-process state. Two instances incrementing the same bucket at the same
// instant both land on the one document.
//
// Fails OPEN. If the database is unreachable the route that called this is
// about to fail anyway (every auth route needs it), and blocking sign-in
// because the limiter's own store hiccupped would turn a blip into an outage.
export async function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const id = `${key}:${bucket}`;
  // Keep the row one extra window past its end so the TTL sweep never races a
  // request that is still inside the window.
  const expiresAt = new Date((bucket + 2) * windowMs);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await RateLimit.findOneAndUpdate(
        { _id: id },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true },
      );
      return doc.count <= max;
    } catch (err) {
      // Two instances upserting the same brand-new bucket in the same instant:
      // the loser gets a duplicate-key error. The row now exists, so the retry
      // is a plain $inc and succeeds.
      if (err?.code === 11000 && attempt === 0) continue;
      console.error('[rateLimit] store unavailable, allowing request:', err?.message || err);
      return true;
    }
  }
  return true;
}
