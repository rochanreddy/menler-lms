import mongoose from 'mongoose';

// The job feed, on its OWN cluster.
//
// skeo-job-pipeline scrapes eleven sources every morning into a database on a
// separate Atlas project, and this service reads it. That is why it is a
// second connection rather than a collection on the LMS cluster: the LMS
// touches only lms_* collections on its own cluster (see db.js), and the jobs
// were never going to be one of them - they belong to the pipeline, which two
// products read.
//
// READ ONLY. Nothing in this service writes here. Hand-posted openings live in
// lms_job_postings on the LMS's own cluster instead, so a bug in Menler can
// never damage a feed Skeo also reads. JOBS_MONGODB_URI should carry a
// read-only Atlas user for the same reason.
//
// Created lazily, on first use: the LMS has to boot and serve every other
// route when JOBS_MONGODB_URI is unset, and a board that says "no feed
// configured" is better than a server that will not start.
let connection = null;

export const jobsDbConfigured = () => Boolean(process.env.JOBS_MONGODB_URI);

export function jobsDb() {
  if (!jobsDbConfigured()) return null;

  if (!connection) {
    connection = mongoose.createConnection(process.env.JOBS_MONGODB_URI, {
      // A small pool: the board reads a few hundred rows at most per
      // request and caches the result, so it never needs the main pool's size.
      maxPoolSize: 5,
      // Fail fast. If the feed is down the board falls back to hand-posted
      // openings, and a student should not wait thirty seconds to see them.
      serverSelectionTimeoutMS: 8000,
    });
    connection.on('connected', () => console.log('Jobs DB connected →', connection.name));
    connection.on('error', (err) => console.error('Jobs DB error:', err.message));
  }

  return connection;
}
