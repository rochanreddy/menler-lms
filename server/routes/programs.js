import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Program } from '../models/Program.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { parseDocToModules } from '../utils/docparse.js';

const router = Router();

// In-memory upload for doc import (we parse the buffer, we don't store the file).
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Admin module-block: strip blocked curriculum modules from what a non-admin
// user sees. The module simply doesn't exist for them (Learning, progress UI).
function withoutBlockedModules(program, user) {
  const blocked = new Set((user.blocked?.moduleIds || []).map(String));
  if (user.role === 'admin' || blocked.size === 0) return program;
  const p = program.toObject();
  p.modules = (p.modules || []).filter((m) => !blocked.has(String(m._id)));
  return p;
}

// Curriculum editing: admin, a mentor the admin assigned to this program, or a
// mentor running any batch of it (batch assignment is the admin's real-world
// "this mentor teaches this" signal).
async function canEditProgram(user, program) {
  if (user.role === 'admin') return true;
  if (user.role !== 'mentor') return false;
  if ((program.mentorIds || []).some((m) => m.toString() === user._id.toString())) return true;
  return !!(await Batch.exists({ programId: program._id, mentorIds: user._id }));
}

// Curriculum VISIBILITY, which is not the same thing as editing. Reading a
// programme exposes every lesson body, both PDF links and the class link, so
// it has to be scoped to people actually in it:
//   admin    → everything
//   mentor   → programmes they're assigned to, or run a batch of (same
//              two-way rule canEditProgram uses)
//   student  → programmes of the batches they're enrolled in
// An admin-blocked batch is not a way in, matching myBatchIds in utils/access.js.
const batchMemberField = (user) => (user.role === 'mentor' ? { mentorIds: user._id } : { studentIds: user._id });

/** Programme ids this user may see, or null meaning "no restriction" (admin). */
async function visibleProgramIds(user) {
  if (user.role === 'admin') return null;
  const batches = await Batch.find(batchMemberField(user)).select('programId');
  const blocked = new Set((user.blocked?.batchIds || []).map(String));
  const ids = new Set(
    batches.filter((b) => b.programId && !blocked.has(String(b._id))).map((b) => String(b.programId)),
  );
  if (user.role === 'mentor') {
    for (const p of await Program.find({ mentorIds: user._id }).select('_id')) ids.add(String(p._id));
  }
  return [...ids];
}

/** Same rule, asked about one programme — one query instead of loading them all. */
async function canViewProgram(user, program) {
  if (user.role === 'admin') return true;
  if (user.role === 'mentor' && (program.mentorIds || []).some((m) => m.toString() === user._id.toString())) return true;
  const batches = await Batch.find({ programId: program._id, ...batchMemberField(user) }).select('_id');
  const blocked = new Set((user.blocked?.batchIds || []).map(String));
  // Enrolled in more than one batch of it? One unblocked batch is enough.
  return batches.some((b) => !blocked.has(String(b._id)));
}

// GET /api/lms/programs — lists the programmes this user is actually in.
// ?fields=summary skips the embedded curriculum tree (every module, chapter,
// topic and lesson body) for callers that only need id/title/published to
// build a picker — opt-in, so anything already reading .modules from this
// list is unaffected.
router.get('/', requireAuth, async (req, res) => {
  const summary = req.query.fields === 'summary';
  const visible = await visibleProgramIds(req.user);
  const query = Program.find(visible === null ? {} : { _id: { $in: visible } }).sort({ createdAt: -1 });
  if (summary) query.select('title slug type published');
  const programs = await query;
  res.json({ programs: programs.map((p) => withoutBlockedModules(p, req.user)) });
});

// GET /api/lms/programs/:id — full curriculum tree, members only.
router.get('/:id', requireAuth, async (req, res) => {
  const program = await Program.findById(req.params.id);
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  if (!(await canViewProgram(req.user, program))) return res.status(403).json({ error: 'Forbidden.' });
  res.json({ program: withoutBlockedModules(program, req.user) });
});

// POST /api/lms/programs — admin only.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, type, description, slug } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const program = await Program.create({ title, type: type || '', description: description || '', slug: slug || '' });
  res.status(201).json({ program });
});

// POST /api/lms/programs/:id/mentors { userId | email } — admin assigns a mentor
// to teach this program (grants access to all its batches).
router.post('/:id/mentors', requireAuth, requireRole('admin'), async (req, res) => {
  const { userId, email } = req.body || {};
  const mentor = userId
    ? await User.findById(userId)
    : await User.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!mentor || mentor.role !== 'mentor') return res.status(404).json({ error: 'Mentor not found.' });
  await Program.findByIdAndUpdate(req.params.id, { $addToSet: { mentorIds: mentor._id } });
  res.json({ ok: true });
});

// DELETE /api/lms/programs/:id/mentors/:userId — admin un-assigns a mentor.
router.delete('/:id/mentors/:userId', requireAuth, requireRole('admin'), async (req, res) => {
  await Program.findByIdAndUpdate(req.params.id, { $pull: { mentorIds: req.params.userId } });
  res.json({ ok: true });
});

// POST /api/lms/programs/:id/import — admin or an assigned mentor uploads a
// .docx/.pdf/.md/.txt. Returns the auto-structured module tree as a PREVIEW
// (not saved) so it can be reviewed/edited before committing via PATCH.
router.post('/:id/import', requireAuth, requireRole('admin', 'mentor'), importUpload.single('file'), async (req, res) => {
  const target = await Program.findById(req.params.id).select('mentorIds');
  if (!target) return res.status(404).json({ error: 'Program not found.' });
  if (!(await canEditProgram(req.user, target))) return res.status(403).json({ error: 'Only mentors assigned to this program can edit its curriculum.' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  try {
    const { modules, stats } = await parseDocToModules(req.file.buffer, req.file.originalname || '');
    if (!modules.length) return res.status(422).json({ error: 'Could not find any structured content in that file. Add headings (e.g. # Module, ## Chapter, ### Lesson) and retry.' });
    res.json({ modules, stats, source: req.file.originalname });
  } catch (e) {
    res.status(422).json({ error: `Could not read that file: ${e.message}` });
  }
});

// PATCH /api/lms/programs/:id — admin, or a mentor assigned to this program
// (curriculum editing). Mentors may edit content/publish state but not retitle
// or re-slug the program itself.
router.patch('/:id', requireAuth, requireRole('admin', 'mentor'), async (req, res) => {
  const target = await Program.findById(req.params.id).select('mentorIds');
  if (!target) return res.status(404).json({ error: 'Program not found.' });
  if (!(await canEditProgram(req.user, target))) return res.status(403).json({ error: 'Only mentors assigned to this program can edit its curriculum.' });

  const editable = req.user.role === 'admin'
    ? ['title', 'type', 'description', 'slug', 'published', 'modules']
    : ['description', 'published', 'modules'];
  const allowed = {};
  for (const k of editable) if (req.body?.[k] !== undefined) allowed[k] = req.body[k];
  const program = await Program.findByIdAndUpdate(req.params.id, allowed, { new: true });
  res.json({ program });
});

export default router;
