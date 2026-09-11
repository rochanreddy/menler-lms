import mongoose from 'mongoose';

// One record per (session, student). Mentors mark it; students see their %.
//
// The three fields below the status are additive and optional: a record written
// before they existed simply has none of them, reads as `attendedMs: 0` /
// `markedBy: ''`, and is deliberately exempt from the 45% rule — nothing in
// this file rewrites history.
const attendanceSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['present', 'absent'], default: 'absent' },

    /** Milliseconds inside the class, summed across every join and re-join. */
    attendedMs: { type: Number, default: 0 },
    /** Set while a Zoom presence is open — a join whose leave has not arrived.
     *  The sweep closes any that are still open when the class is over. */
    openedAt: { type: Date, default: null },
    /** Who put this row here. 'mentor' is never overruled by the 45% rule: a
     *  register saved by the person who taught the class outranks telemetry. */
    markedBy: { type: String, enum: ['', 'zoom', 'self', 'mentor'], default: '' },
  },
  { timestamps: true },
);

// One attendance row per student per session.
attendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export const Attendance = mongoose.model('Attendance', attendanceSchema, 'lms_attendance');
