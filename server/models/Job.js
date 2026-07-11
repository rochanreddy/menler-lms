import mongoose from 'mongoose';

// A job posted by a partner (B2B) — visible to all students on the Job Board.
const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    location: { type: String, default: '' },
    applyUrl: { type: String, default: '' },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    open: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Job = mongoose.model('Job', jobSchema, 'lms_jobs');
