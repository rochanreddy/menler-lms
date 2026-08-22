import mongoose from 'mongoose';

// A file discovered inside a submitted Drive folder (only populated once
// checkStatus = READY). No _id — these are display-only, never referenced.
const submissionFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['video', 'image', 'doc', 'other'], default: 'other' },
    webViewLink: { type: String, default: '' },
    mimeType: { type: String, default: '' },
  },
  { _id: false },
);

// A student's submission for one assignment/project, plus the mentor's grade.
//
// Three independent layers live on this one document, kept in separate field
// groups so each can evolve without touching the others:
//   1. Drive folder verification (checkStatus/errorDetail/files/checkedAt) —
//      automated structural check, see utils/driveVerify.js.
//   2. Mentor grading (status/score/feedback) — unchanged, human-driven.
//   3. Automated content scoring (aiReview) — see utils/aiGrade.js. Advisory
//      only: it never writes to #2's score/feedback/status. A mentor reads it
//      and still grades by hand.
const submissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, default: '' },
    driveLink: { type: String, default: '' },
    text: { type: String, default: '' },
    score: { type: Number, default: null },
    feedback: { type: String, default: '' },
    status: { type: String, enum: ['submitted', 'graded'], default: 'submitted', index: true },

    // Drive folder verification (see utils/driveVerify.js). Null until a
    // driveLink submission has been checked at least once.
    checkStatus: { type: String, enum: ['PENDING_CHECK', 'READY', 'NEEDS_FIXES', 'CHECK_FAILED', null], default: null, index: true },
    errorDetail: { type: String, default: null },
    files: { type: [submissionFileSchema], default: [] },
    checkedAt: { type: Date, default: null },

    // Automated review (see utils/aiGrade.js). Null until an AI review has been
    // run at least once. Each stage's raw JSON is kept as-is so the pipeline can
    // change shape without a migration, and so a mentor can see what the model
    // actually said rather than only the rolled-up number.
    aiReview: {
      status: { type: String, enum: ['running', 'done', 'failed', null], default: null },
      writeup: { type: mongoose.Schema.Types.Mixed, default: null },   // stage 1
      screenshots: { type: mongoose.Schema.Types.Mixed, default: null }, // stage 2
      final: { type: mongoose.Schema.Types.Mixed, default: null },      // stage 3
      model: { type: String, default: '' },
      error: { type: String, default: null },
      reviewedAt: { type: Date, default: null },
    },

    // Set once a mentor grades the submission; blocks further student edits
    // until a mentor explicitly unlocks it (POST /:id/unlock).
    locked: { type: Boolean, default: false },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// One submission per student per assignment (re-submitting updates it).
submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

export const Submission = mongoose.model('Submission', submissionSchema, 'lms_submissions');
