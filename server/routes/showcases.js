import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Assignment } from '../models/Assignment.js';
import { Batch } from '../models/Batch.js';
import { FileAsset } from '../models/FileAsset.js';
import { Showcase } from '../models/Showcase.js';
import { canAccessBatch, isMentorOfBatch, myBatchIds } from '../utils/access.js';
import { attachmentName, sniffAttachment } from '../utils/doubtAttachments.js';
import { rateLimit } from '../utils/rateLimit.js';

// The Kickstarter showcase: what a student built, put in front of their cohort.
// See models/Showcase.js for why it is not a Submission.
//
// Kickstarter only, because that is the programme it was asked for: a batch of
// any other programme answers `eligible: false` and the tab shows nothing.
// Everyone in the batch reads every entry — a showcase nobody else can see is
// a submission — and only the student who wrote one can change it. A mentor of
// the batch or an admin can take one down.

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LINKS = 5;
const MAX_PER_BATCH = 30; // per student, so a jammed submit cannot fill the wall
const LIMITS = { title: 120, description: 4000, motive: 2000, label: 60, url: 2000 };

const REFUSAL = 'Attach a PDF, an image, a Word, Excel or PowerPoint file, or a text or code file. Files with macros are not accepted.';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
});

const isKickstarter = (title) => /kickstarter/i.test(String(title || ''));

/** The Kickstarter batches this user belongs to, as { _id, name }. */
async function kickstarterBatches(user) {
  const ids = await myBatchIds(user);
  const batches = await Batch.find({ _id: { $in: ids } }).select('name programId').populate('programId', 'title');
  return batches.filter((b) => isKickstarter(b.programId?.title)).map((b) => ({ _id: b._id, name: b.name }));
}

async function isKickstarterBatch(batchId) {
  const b = await Batch.findById(batchId).select('programId').populate('programId', 'title');
  return !!b && isKickstarter(b.programId?.title);
}

// Only http(s) is ever stored, because every one of these is rendered as an
// href in someone else's browser.
function webUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.length > LIMITS.url) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}

function parseJson(v, fallback) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

/** Validate the text half of a create or edit. Returns { value } or { error }. */
async function readFields(body, batchId) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const motive = String(body.motive || '').trim();
  if (!title) return { error: 'Give your project a title.' };
  if (!description) return { error: 'Describe what you built.' };
  if (!motive) return { error: 'Say why you built it.' };
  if (title.length > LIMITS.title) return { error: `Keep the title under ${LIMITS.title} characters.` };
  if (description.length > LIMITS.description) return { error: `Keep the description under ${LIMITS.description} characters.` };
  if (motive.length > LIMITS.motive) return { error: `Keep the motive under ${LIMITS.motive} characters.` };

  const rawLinks = parseJson(body.links, []);
  if (!Array.isArray(rawLinks)) return { error: 'Links could not be read.' };
  const links = [];
  for (const l of rawLinks) {
    if (!String(l?.url || '').trim()) continue; // an empty row on the form
    const url = webUrl(l.url);
    if (!url) return { error: `"${String(l.url).slice(0, 60)}" is not a web address. Links must start with http:// or https://.` };
    links.push({ url, label: String(l.label || '').trim().slice(0, LIMITS.label) });
  }
  if (links.length > MAX_LINKS) return { error: `Up to ${MAX_LINKS} links.` };

  const driveLink = webUrl(body.driveLink);
  if (driveLink === null) return { error: 'The Drive link is not a web address.' };

  let assignmentId = null;
  if (body.assignmentId) {
    if (!mongoose.isValidObjectId(body.assignmentId)) return { error: 'That project could not be found.' };
    const a = await Assignment.findOne({ _id: body.assignmentId, batchId }).select('_id');
    if (!a) return { error: 'That project is not part of your batch.' };
    assignmentId = a._id;
  }

  return { value: { title, description, motive, links, driveLink, assignmentId } };
}

/** Sniff every upload BEFORE anything is stored, so a refusal leaves no orphans. */
function readFiles(files) {
  const out = [];
  for (const file of files || []) {
    const mime = sniffAttachment(file);
    if (!mime) return { error: `${file.originalname || 'That file'} was not accepted. ${REFUSAL}` };
    out.push({ file, mime });
  }
  return { value: out };
}

async function storeFiles(picked, ownerId) {
  const stored = [];
  for (const { file, mime } of picked) {
    const asset = await FileAsset.create({
      data: file.buffer,
      name: attachmentName(file.originalname, mime),
      mimeType: mime,
      size: file.size,
      ownerId,
      kind: 'showcase-file',
      hash: '', // never shared, so deleting the entry can delete the bytes
    });
    stored.push({ url: `/uploads/${asset._id}`, name: asset.name, mimeType: mime, size: asset.size });
  }
  return stored;
}

async function dropFiles(files = []) {
  const ids = files.map((f) => /^\/uploads\/([a-f0-9]{24})$/i.exec(f?.url || '')?.[1]).filter(Boolean);
  if (ids.length) await FileAsset.deleteMany({ _id: { $in: ids }, kind: 'showcase-file' });
}

const populate = (q) => q.populate('studentId', 'fullName').populate('assignmentId', 'title type');

function shape(s, user) {
  const o = s.toObject();
  return {
    ...o,
    student: o.studentId ? { _id: o.studentId._id, name: o.studentId.fullName || 'A classmate' } : null,
    studentId: o.studentId?._id || o.studentId,
    assignment: o.assignmentId ? { _id: o.assignmentId._id, title: o.assignmentId.title, type: o.assignmentId.type } : null,
    assignmentId: o.assignmentId?._id || o.assignmentId,
    mine: String(o.studentId?._id || o.studentId) === String(user._id),
  };
}

// multer's errors, in words a student can act on.
function uploadError(err) {
  if (err.code === 'LIMIT_FILE_SIZE') return { status: 413, error: 'Each file must be under 10 MB.' };
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return { status: 400, error: `Up to ${MAX_FILES} files.` };
  return { status: 400, error: 'Upload failed.' };
}

const router = Router();

// GET /api/lms/showcases?batchId=…
// Without batchId: every Kickstarter batch the viewer is in (the student tab).
// With it: that one batch (the mentor's and admin's batch page).
router.get('/', requireAuth, async (req, res) => {
  const { batchId } = req.query;
  let batches;
  if (batchId) {
    if (!mongoose.isValidObjectId(batchId) || !(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    if (!(await isKickstarterBatch(batchId))) return res.json({ eligible: false, batches: [], showcases: [] });
    batches = [{ _id: batchId }];
  } else {
    batches = await kickstarterBatches(req.user);
  }
  if (!batches.length) return res.json({ eligible: false, batches: [], showcases: [] });

  const rows = await populate(Showcase.find({ batchId: { $in: batches.map((b) => b._id) } }).sort({ createdAt: -1 }).limit(500));
  res.json({ eligible: true, batches, showcases: rows.map((s) => shape(s, req.user)) });
});

// POST /api/lms/showcases — multipart: title, description, motive, batchId,
// optional assignmentId, driveLink, links (JSON [{url,label}]) and files[].
router.post('/', requireAuth, requireRole('student'), (req, res) => {
  upload.array('files', MAX_FILES)(req, res, async (err) => {
    if (err) { const e = uploadError(err); return res.status(e.status).json({ error: e.error }); }
    const body = req.body || {};

    const mine = await kickstarterBatches(req.user);
    const batch = body.batchId ? mine.find((b) => String(b._id) === String(body.batchId)) : mine.length === 1 ? mine[0] : null;
    if (!batch) return res.status(403).json({ error: mine.length ? 'Pick which batch this is for.' : 'The showcase is open to Kickstarter students.' });

    const fields = await readFields(body, batch._id);
    if (fields.error) return res.status(400).json({ error: fields.error });
    const files = readFiles(req.files);
    if (files.error) return res.status(415).json({ error: files.error });

    if ((await Showcase.countDocuments({ batchId: batch._id, studentId: req.user._id })) >= MAX_PER_BATCH) {
      return res.status(429).json({ error: `You have ${MAX_PER_BATCH} entries already. Remove one to add another.` });
    }
    if (!(await rateLimit(`showcase:new:${req.user._id}`, 10, 60 * 60 * 1000))) {
      return res.status(429).json({ error: 'That is a lot of entries in an hour. Try again later.' });
    }

    try {
      const stored = await storeFiles(files.value, req.user._id);
      const s = await Showcase.create({ ...fields.value, batchId: batch._id, studentId: req.user._id, files: stored });
      const row = await populate(Showcase.findById(s._id));
      res.status(201).json({ showcase: shape(row, req.user) });
    } catch {
      res.status(500).json({ error: 'Could not save your entry. Try again.' });
    }
  });
});

// PATCH /api/lms/showcases/:id — the author only. Same fields as POST, plus
// removeFiles (JSON array of file ids). New files[] are added to what is kept.
router.patch('/:id', requireAuth, requireRole('student'), (req, res) => {
  upload.array('files', MAX_FILES)(req, res, async (err) => {
    if (err) { const e = uploadError(err); return res.status(e.status).json({ error: e.error }); }
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });
    const s = await Showcase.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found.' });
    if (String(s.studentId) !== String(req.user._id)) return res.status(403).json({ error: 'Only the author can edit this.' });
    if (!(await canAccessBatch(req.user, s.batchId))) return res.status(403).json({ error: 'Forbidden.' });

    const body = req.body || {};
    const fields = await readFields(body, s.batchId);
    if (fields.error) return res.status(400).json({ error: fields.error });
    const files = readFiles(req.files);
    if (files.error) return res.status(415).json({ error: files.error });

    const remove = new Set(parseJson(body.removeFiles, []).map(String));
    const dropped = s.files.filter((f) => remove.has(String(f._id)));
    const kept = s.files.filter((f) => !remove.has(String(f._id)));
    if (kept.length + files.value.length > MAX_FILES) {
      return res.status(400).json({ error: `Up to ${MAX_FILES} files. Remove one to add another.` });
    }

    try {
      const stored = await storeFiles(files.value, req.user._id);
      Object.assign(s, fields.value);
      s.files = [...kept.map((f) => f.toObject()), ...stored];
      await s.save();
      await dropFiles(dropped);
      const row = await populate(Showcase.findById(s._id));
      res.json({ showcase: shape(row, req.user) });
    } catch {
      res.status(500).json({ error: 'Could not save your changes. Try again.' });
    }
  });
});

// DELETE /api/lms/showcases/:id — the author, a mentor of the batch, or an admin.
router.delete('/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const s = await Showcase.findById(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found.' });
  const isAuthor = String(s.studentId) === String(req.user._id);
  if (!isAuthor && !(await isMentorOfBatch(req.user, s.batchId))) return res.status(403).json({ error: 'Not allowed.' });
  await dropFiles(s.files);
  await s.deleteOne();
  res.json({ ok: true });
});

export default router;
