import mongoose from 'mongoose';

// One row per (route, caller, time-bucket) for the auth rate limiter. Lives in
// the database rather than process memory so the count is shared by every
// instance of the API: an in-memory Map silently multiplies every limit by the
// instance count the moment the service is scaled out (audit finding #24).
//
// _id IS the bucket key ("login:1.2.3.4:28942317"), so "one counter per
// bucket" rests on primary-key uniqueness rather than a read-then-write race.
// The TTL index drops a bucket shortly after its window closes.
const rateLimitSchema = new mongoose.Schema(
  {
    _id: { type: String },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit = mongoose.model('RateLimit', rateLimitSchema, 'lms_rate_limits');
