import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Job } from '../models/Job.js';
import { Application } from '../models/Application.js';

const router = Router();

// GET /api/lms/jobs — all open jobs. For students, marks which they've applied to.
router.get('/', requireAuth, async (req, res) => {
  const jobs = await Job.find({ open: true }).sort({ createdAt: -1 });
  if (req.user.role === 'student') {
    const apps = await Application.find({ studentId: req.user._id, jobId: { $in: jobs.map((j) => j._id) } });
    const applied = new Set(apps.map((a) => a.jobId.toString()));
    return res.json({ jobs: jobs.map((j) => ({ ...j.toObject(), appliedByMe: applied.has(j._id.toString()) })) });
  }
  res.json({ jobs });
});

// GET /api/lms/jobs/mine — partner's own postings, with applicant counts.
router.get('/mine', requireAuth, requireRole('partner', 'admin'), async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { postedBy: req.user._id };
  const jobs = await Job.find(filter).sort({ createdAt: -1 });
  const counts = await Application.aggregate([{ $group: { _id: '$jobId', n: { $sum: 1 } } }]);
  const byId = new Map(counts.map((c) => [c._id.toString(), c.n]));
  res.json({ jobs: jobs.map((j) => ({ ...j.toObject(), applicantCount: byId.get(j._id.toString()) || 0 })) });
});

// GET /api/lms/jobs/applied/me — a student's applications.
router.get('/applied/me', requireAuth, async (req, res) => {
  const apps = await Application.find({ studentId: req.user._id }).populate('jobId', 'title company location').sort({ createdAt: -1 });
  res.json({ applications: apps });
});

// POST /api/lms/jobs — partner/admin posts a job.
router.post('/', requireAuth, requireRole('partner', 'admin'), async (req, res) => {
  const { title, company, description, location, applyUrl } = req.body || {};
  if (!title || !company) return res.status(400).json({ error: 'Title and company are required.' });
  const job = await Job.create({ title, company, description: description || '', location: location || '', applyUrl: applyUrl || '', postedBy: req.user._id });
  res.status(201).json({ job });
});

// POST /api/lms/jobs/:id/apply — student applies (idempotent).
router.post('/:id/apply', requireAuth, requireRole('student'), async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job || !job.open) return res.status(404).json({ error: 'Job not found.' });
  await Application.updateOne({ jobId: job._id, studentId: req.user._id }, { $setOnInsert: { status: 'applied' } }, { upsert: true });
  res.status(201).json({ ok: true });
});

// GET /api/lms/jobs/:id/applicants — the posting partner (or admin) sees applicants.
router.get('/:id/applicants', requireAuth, requireRole('partner', 'admin'), async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (req.user.role !== 'admin' && job.postedBy?.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Forbidden.' });
  const apps = await Application.find({ jobId: job._id }).populate('studentId', 'fullName email resumeUrl education professional').sort({ createdAt: -1 });
  res.json({ job: { id: job._id, title: job.title, company: job.company }, applicants: apps });
});

export default router;
