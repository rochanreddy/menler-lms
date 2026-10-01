import mongoose from 'mongoose';

// A file discovered inside a submitted Drive folder (only populated once
// checkStatus = READY). No _id — these are display-only, never referenced.
const submissionFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // Must stay in step with what classifyFile() in utils/driveVerify.js can
    // return. It can return 'html' and 'slides', and when it did, saving the
    // submission threw a validation error instead of storing the file — which
    // is how an assignment that opted into HTML (a Claude Artifact, the named
    // deliverable of six Kickstarter assignments) failed at the last step.
    type: { type: String, enum: ['video', 'image', 'doc', 'slides', 'html', 'other'], default: 'other' },
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
//   2. The grade (status/score/feedback/gradedBy). Set automatically fifteen
//      minutes after a verified hand-in (utils/autoGrade.js); a mentor can
//      still regrade by hand, which wins.
//   3. Automated content scoring (aiReview) — see utils/aiGrade.js. The full
//      rubric breakdown behind #2, kept for the mentor and admin.
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
    // Who set score/feedback: the automatic grader (utils/autoGrade.js) or a
    // mentor by hand. A mentor regrading an AI grade turns it into 'mentor'.
    gradedBy: { type: String, enum: ['ai', 'mentor', null], default: null },

    // When the student last handed this in (created or edited). The automatic
    // grade waits AUTO_GRADE_DELAY_MS from here, so an edit restarts the clock.
    // Null on submissions made before auto-grading existed, which it leaves
    // alone rather than grading a whole backlog the minute it ships.
    submittedAt: { type: Date, default: null, index: true },

    // Drive folder verification (see utils/driveVerify.js). Null until a
    // driveLink submission has been checked at least once.
    checkStatus: { type: String, enum: ['PENDING_CHECK', 'READY', 'NEEDS_FIXES', 'CHECK_FAILED', null], default: null, index: true },
    errorDetail: { type: String, default: null },
    files: { type: [submissionFileSchema], default: [] },
    checkedAt: { type: Date, default: null },

    // Automated review (see utils/aiGrade.js, scored against utils/rubric.js).
    // Null until a review has been run at least once. The result is kept as
    // Mixed and as-is, so the rubric can change shape without a migration and
    // so a mentor can see what the model actually said rather than only the
    // rolled-up number.
    //
    // `final` holds the whole result: the six criteria with their weights, the
    // deliverables checklist, red flags, the evidence manifest that was graded,
    // and the prose. `writeup` and `screenshots` are the two stages of the
    // pre-rubric pipeline, kept so reviews stored before the rubric landed
    // still render instead of vanishing from the mentor's screen.
    aiReview: {
      status: { type: String, enum: ['running', 'done', 'failed', null], default: null },
      final: { type: mongoose.Schema.Types.Mixed, default: null },

      // A MinHash sketch of this submission's written text (utils/similarity.js),
      // kept so the NEXT student reviewed on this assignment can be compared
      // against it without re-downloading and re-parsing the whole Drive folder.
      // Indexed only by the assignment query that reads it; it is a fixed 128
      // integers, so it costs about a kilobyte per submission.
      fingerprint: { type: mongoose.Schema.Types.Mixed, default: null },
      writeup: { type: mongoose.Schema.Types.Mixed, default: null },     // legacy
      screenshots: { type: mongoose.Schema.Types.Mixed, default: null }, // legacy
      model: { type: String, default: '' },
      error: { type: String, default: null },
      reviewedAt: { type: Date, default: null },
      // For the automatic grader: when the running review was claimed (so one
      // that died mid-run can be reclaimed) and how many runs have failed on
      // this hand-in (so a submission the model cannot read stops being retried).
      startedAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
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
