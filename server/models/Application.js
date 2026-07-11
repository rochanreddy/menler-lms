import mongoose from 'mongoose';

// A student's application to a job. One per (job, student).
const applicationSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['applied', 'shortlisted', 'rejected'], default: 'applied' },
  },
  { timestamps: true },
);

applicationSchema.index({ jobId: 1, studentId: 1 }, { unique: true });

export const Application = mongoose.model('Application', applicationSchema, 'lms_applications');
