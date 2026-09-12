import mongoose from 'mongoose';

// One student's review of one class. Every student in the batch is asked, and
// the LMS is blocked until it is in — so this is a complete record of how a
// cohort felt about a class, not a self-selected sample.
//
// `attended` is a snapshot of the register at the moment of writing, not a
// live join: a review answered the morning after says whether that student was
// actually in the room, which is the difference between "the pace was too
// fast" and "I watched the recording".
const classReviewSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Four scores, each 1 (low) to 5 (high). They are separate fields rather
    // than one average because they fail apart: a class can be rated highly
    // and still be understood by nobody, and that gap is the useful signal.
    /** How would you rate today's session? */
    overall: { type: Number, required: true, min: 1, max: 5 },
    /** How useful was the session for you? */
    useful: { type: Number, required: true, min: 1, max: 5 },
    /** How well did you understand what was taught? */
    understanding: { type: Number, required: true, min: 1, max: 5 },
    /** How would you rate the instructor and session experience? */
    instructor: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true, maxlength: 2000 },
    attended: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One review per student per class — the gate asks once and never again.
classReviewSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export const ClassReview = mongoose.model('ClassReview', classReviewSchema, 'lms_class_reviews');
