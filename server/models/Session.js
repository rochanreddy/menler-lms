import mongoose from 'mongoose';

// A scheduled class within a batch. Powers the student Home "upcoming class",
// the calendar, and attendance (each attendance record points at a session).
const sessionSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    title: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    joinUrl: { type: String, default: '' },
    zoomMeetingId: { type: String, default: '', index: true }, // matches Zoom webhook events → attendance
    recordingUrl: { type: String, default: '' },
    // Set once the no-shows have been marked absent (utils/attendanceSweep.js).
    absenceSweptAt: { type: Date, default: null, index: true },

    // Stamped when the class reminders went out (utils/sessionReminders.js) —
    // one field per mail, because the two fire an hour apart and a restart in
    // between must not resend the first.
    //
    // These are claimed with findOneAndUpdate BEFORE the send, not after. The
    // absence sweep can safely replay because its writes are idempotent
    // upserts; email is not, and a duplicate here is a second copy in a
    // student's inbox. Stamping first means a crash mid-sweep costs a missed
    // reminder rather than a double one, which is the right way round.
    remindedHourAt: { type: Date, default: null },
    remindedStartAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The reminder sweep runs every minute and asks for the classes starting
// inside a narrow window. Without this it is a collection scan a thousand
// times a day; with it, the window is a range seek and the two `reminded*`
// nulls are a filter over the handful of rows it returns.
sessionSchema.index({ startsAt: 1 });

export const Session = mongoose.model('Session', sessionSchema, 'lms_sessions');
