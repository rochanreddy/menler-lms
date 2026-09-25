import mongoose from 'mongoose';
import { jobsDb } from '../jobsDb.js';

// A job scraped by skeo-job-pipeline, read from its own cluster (jobsDb.js).
//
// READ ONLY - nothing here writes to it. `strict: false` because the pipeline
// can add a field without this model knowing, and a stricter definition would
// silently drop it on read.
//
// The fields declared are the ones this board depends on. The four scores are
// what utils/jobShortlist.js ranks on; none is computed here.
const scrapedJobSchema = new mongoose.Schema(
  {
    title: String,
    company: String,
    companyLogo: String,
    location: String,
    country: String,
    isRemote: Boolean,
    url: String,
    source: String,
    domain: String,
    workType: String,
    experienceLevel: String,
    relevance: Number,
    achievability: Number,
    indiaFit: Number,
    easeOfApply: Number,
    rankReasons: [String],
    matchedSkills: [String],
    postedAt: Date,
    fetchedAt: Date,
    isActive: Boolean,
  },
  { strict: false, collection: 'jobs' },
);

let model = null;

/** The model, or null when no jobs database is configured. */
export function ScrapedJob() {
  const connection = jobsDb();
  if (!connection) return null;
  if (!model) model = connection.model('ScrapedJob', scrapedJobSchema);
  return model;
}
