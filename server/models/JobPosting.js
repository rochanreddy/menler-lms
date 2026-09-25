import mongoose from 'mongoose';
import { DOMAIN_VALUES, WORK_TYPE_VALUES, EXPERIENCE_LEVEL_VALUES } from '../utils/jobTaxonomy.js';

// An opening posted by hand by an admin: a partner company's role, something
// that came in by email, anything that never reaches a job board.
//
// Kept on the LMS's own cluster, as lms_job_postings, rather than written into
// the pipeline's feed. The feed is read-only from here on purpose, so a bug in
// the LMS cannot damage data Skeo also reads. The board reads both and shows
// these first. Field names match the pipeline's schema, so the merge needs no
// translation.
const jobPostingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    location: { type: String, default: '' },
    isRemote: { type: Boolean, default: false },
    // Where a student applies. Always an absolute http(s) URL - the route
    // refuses anything else, because it becomes the card's Apply link.
    applyUrl: { type: String, default: '' },
    description: { type: String, default: '' },
    domain: { type: String, default: null, enum: [...DOMAIN_VALUES, null] },
    workType: { type: String, default: 'unspecified', enum: WORK_TYPE_VALUES },
    experienceLevel: { type: String, default: 'unspecified', enum: EXPERIENCE_LEVEL_VALUES },
    // When the role opened. The board's ten-day window is measured from this,
    // so a hand-posted opening ages out like any other.
    postedAt: { type: Date, default: Date.now },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

jobPostingSchema.index({ postedAt: -1 });

export const JobPosting = mongoose.model('JobPosting', jobPostingSchema, 'lms_job_postings');
