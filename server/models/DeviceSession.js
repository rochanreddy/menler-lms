import mongoose from 'mongoose';

// One row per sign-in. The LMS is a paid programme, so an account is one
// person: this collection is what turns a stateless Bearer token into a
// revocable session, which is the only way "signing in over there signs you
// out over here" can be enforced at all.
//
// The token carries the `sid` of the row that minted it (see utils/token.js).
// requireAuth refuses a token whose row is revoked, so a takeover lands on the
// old device's very next request rather than whenever its 8h token expires.

/** Reasons a session stops being usable. Stored so the old device can be told why. */
export const REVOKE_REASONS = ['superseded', 'logout', 'revoked', 'password_reset', 'blocked'];

const deviceSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Random, unguessable, and the join key between a token and this row.
    sid: { type: String, required: true, unique: true },

    // Supplied by the client (X-Device-Id) and stable for the life of that
    // browser profile, so re-signing in on the SAME device replaces its own
    // session instead of counting as a second device. Absent for API clients,
    // which then simply get one session per sign-in.
    deviceId: { type: String, default: '' },
    deviceLabel: { type: String, default: 'Unknown device' },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },

    lastSeenAt: { type: Date, default: Date.now },

    // Null while the session is live. Set (with a reason) the moment it is
    // taken over, signed out, or invalidated.
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: [...REVOKE_REASONS, ''], default: '' },
    // Which device took this one's place — the "signed out because you signed
    // in on <X>" line the old device shows is read straight from here.
    revokedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

// A live session is looked up by sid on (almost) every request, and by user for
// the device list. Rows outlive nothing useful once the refresh token they were
// minted with has expired, so Mongo sweeps them at 30 days to match REFRESH_TTL.
deviceSessionSchema.index({ userId: 1, revokedAt: 1, lastSeenAt: -1 });
deviceSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

deviceSessionSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    sid: this.sid,
    device_label: this.deviceLabel,
    ip: this.ip,
    last_seen_at: this.lastSeenAt,
    created_at: this.createdAt,
    revoked_at: this.revokedAt,
    revoked_reason: this.revokedReason || '',
  };
};

export const DeviceSession = mongoose.model('DeviceSession', deviceSessionSchema, 'lms_device_sessions');
