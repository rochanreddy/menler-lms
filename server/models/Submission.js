import mongoose from 'mongoose';

// A student's submission for one assignment/project, plus the mentor's grade.
const submissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, default: '' },
    text: { type: String, default: '' },
    score: { type: Number, default: null },
    feedback: { type: String, default: '' },
    status: { type: String, enum: ['submitted', 'graded'], default: 'submitted', index: true },
  },
  { timestamps: true },
);

// One submission per student per assignment (re-submitting updates it).
submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

export const Submission = mongoose.model('Submission', submissionSchema, 'lms_submissions');
