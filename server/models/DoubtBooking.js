import mongoose from 'mongoose';

// One student's claim on one slot of a doubt session, with what they want to
// ask — which is the half the mentor actually prepares from.
//
// "Only one student at a time slot" is enforced by a UNIQUE INDEX, not by
// checking whether the slot looks free before writing it. Two students tapping
// 7:30 in the same second both read it as free; only the index can settle who
// gets it. The loser's insert fails with E11000 and the route turns that into
// "someone just took that one" plus a refreshed grid — the same reasoning as
// the playback lease keying on the user id.
//
// The second unique index is per student: one slot each, so a booking is MOVED
// (an update in place) rather than accumulated, and nobody quietly holds three
// slots of a six-slot evening.
const doubtBookingSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DoubtSession', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },

    // Asked for on the form even though the account knows it: the person who
    // shows up may go by something other than what the admin typed at
    // enrolment, and the mentor reads this list before the call.
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slotAt: { type: Date, required: true },
    doubts: { type: String, default: '', trim: true, maxlength: 2000 },

    // The meeting link for THIS student's slot, set by the admin after the
    // booking exists. A doubt slot is one person in the room, so the room is
    // usually a fresh Meet per student rather than the session-wide link — and
    // handing out one link before anyone has booked would put every student in
    // the same call. It lives on the booking, not on the slot, so a student who
    // moves from 7:30 to 8:00 keeps their link.
    joinUrl: { type: String, default: '', trim: true },
    // When it was last sent to the student. Sharing is a deliberate act the
    // admin repeats when they want to, the same as pushing the announcement,
    // so the record is of the LAST send.
    joinSharedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

doubtBookingSchema.index({ sessionId: 1, slotAt: 1 }, { unique: true });
doubtBookingSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export const DoubtBooking = mongoose.model('DoubtBooking', doubtBookingSchema, 'lms_doubt_bookings');
