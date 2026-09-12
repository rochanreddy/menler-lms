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

    /** Overall, 1–5. */
    rating: { type: Number, required: true, min: 1, max: 5 },
    /** How the class moved for them. */
    pace: { type: String, enum: ['slow', 'right', 'fast'], required: true },
    comment: { type: String, default: '', trim: true, maxlength: 2000 },
    attended: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One review per student per class — the gate asks once and never again.
classReviewSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export const ClassReview = mongoose.model('ClassReview', classReviewSchema, 'lms_class_reviews');
