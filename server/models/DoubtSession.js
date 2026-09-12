import mongoose from 'mongoose';

// A doubt-clearing session the admin announces: one evening, split into slots,
// one student per slot.
//
// The slots are stored as an explicit list of absolute instants rather than a
// window plus a step, for the same reason sessions store their own start: "7 to
// 10 on Wednesday" is a local-timezone fact the client resolves, and an
// explicit list means a booked slot keeps its identity even if the window is
// later widened or the step changed.
//
// `batchIds` is the audience — one cohort, or every cohort of the programme.
// Slots are unique per SESSION, not per batch: it is one mentor in one room, so
// two batches sharing an evening share the same 7:30.
const doubtSessionSchema = new mongoose.Schema(
  {
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch', index: true }],

    title: { type: String, default: 'Doubt session', trim: true },
    // The write-up that travels into the notification and sits above the form.
    message: { type: String, default: '', trim: true, maxlength: 2000 },
    joinUrl: { type: String, default: '', trim: true },

    slotsAt: [{ type: Date }], // ascending; each is a slot's start instant
    slotMinutes: { type: Number, default: 30, min: 5, max: 120 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Pushing the notification is a deliberate, repeatable act — the admin
    // sends a reminder when they want one — so the record is of the LAST push,
    // and how many people it reached.
    notifiedAt: { type: Date, default: null },
    notifiedCount: { type: Number, default: 0 },
    pushes: { type: Number, default: 0 },

    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** First slot's start, or null for a session with no slots. */
doubtSessionSchema.methods.startsAt = function startsAt() {
  return this.slotsAt?.length ? this.slotsAt[0] : null;
};

/** The instant the last slot finishes — when the session stops being bookable. */
doubtSessionSchema.methods.endsAt = function endsAt() {
  if (!this.slotsAt?.length) return null;
  const last = this.slotsAt[this.slotsAt.length - 1];
  return new Date(new Date(last).getTime() + (this.slotMinutes || 30) * 60000);
};

export const DoubtSession = mongoose.model('DoubtSession', doubtSessionSchema, 'lms_doubt_sessions');
