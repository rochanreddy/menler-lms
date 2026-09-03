import mongoose from 'mongoose';

// The "only one device can watch at a time" lock, as one row per user.
//
// _id IS the user id, which is the whole trick: the uniqueness of the primary
// key is what makes "one watcher" true rather than merely likely. Two devices
// racing to start the same video both try to insert this row, and exactly one
// of them wins — the other gets a duplicate-key error, which the route turns
// into "this account is currently being used on another device".
//
// A lease is held by a SESSION, not a device id: with single-session
// enforcement on, the second device usually cannot get this far at all, and
// this is the backstop for the window where it can (LMS_SINGLE_SESSION=off, or
// two tabs of the same browser).

const playbackLeaseSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // the user id
    sid: { type: String, default: '' },
    deviceLabel: { type: String, default: 'another device' },

    // What is being watched — shown back to the second device so the message
    // is "…watching Session 3" rather than an unexplained refusal.
    videoKey: { type: String, default: '' },
    title: { type: String, default: '' },

    startedAt: { type: Date, default: Date.now },
    heartbeatAt: { type: Date, default: Date.now },
  },
  { _id: false, timestamps: false, versionKey: false },
);

// A browser that is closed mid-video never releases its lease, so the row has
// to expire on its own or that account is locked out of video forever. The
// route treats a lease as stale well before this (see utils/playback.js); the
// TTL is only the sweeper that stops dead rows accumulating.
playbackLeaseSchema.index({ heartbeatAt: 1 }, { expireAfterSeconds: 600 });

export const PlaybackLease = mongoose.model('PlaybackLease', playbackLeaseSchema, 'lms_playback_leases');
