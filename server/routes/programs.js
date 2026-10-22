import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Program } from '../models/Program.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { parseDocToModules } from '../utils/docparse.js';
import { CURRICULUM_FILE_REFUSAL, MAX_CURRICULUM_BYTES, curriculumFileType, storeCurriculumFile } from '../utils/curriculumFiles.js';
import { materialInBatch, scopeMaterials } from '../utils/materialScope.js';

const router = Router();

// In-memory upload for doc import (we parse the buffer, we don't store the file).
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
// Teacher notes pushed onto a week, session or lesson: several files in one
// go — PDF, Office, Markdown, images (see storeCurriculumFile) — each stored
// through the same hash-deduped store as the editor's single drop.
const MAX_MATERIALS_PER_PUSH = 20;
const materialUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CURRICULUM_BYTES, files: MAX_MATERIALS_PER_PUSH },
});

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

// What a student is served of a programme: the blocked modules gone, and the
// teacher notes cut down to the ones pushed to their own batch — a new
// intake must not open the last cohort's mentor's decks (utils/materialScope).
// Mentors and admins get the whole tree, because they save it back whole.
function forViewer(program, user, studentBatches) {
  const p = withoutBlockedModules(program, user);
  if (user.role !== 'student') return p;
  const plain = typeof p.toObject === 'function' ? p.toObject() : p;
  const mine = (studentBatches || []).filter((b) => String(b.programId) === String(plain._id));
  return scopeMaterials(plain, mine);
}

/** A student's own unblocked batches, with what materialInBatch needs. */
async function studentBatchesOf(user) {
  if (user.role !== 'student') return [];
  const blocked = new Set((user.blocked?.batchIds || []).map(String));
  const batches = await Batch.find({ studentIds: user._id }).select('programId createdAt').lean();
  return batches.filter((b) => !blocked.has(String(b._id)));
}

/**
 * The batch a push of teacher notes is for. A mentor may push only to a batch
 * of this programme they teach; an admin to any batch of it. When the body
 * names none and there is exactly one candidate, that one — so a mentor with
 * one cohort is never asked. Returns { batch } or { error, status }.
 */
async function pushTarget(user, program, batchId) {
  const scope = { programId: program._id, ...(user.role === 'mentor' ? { mentorIds: user._id } : {}) };
  if (batchId) {
    if (!mongoose.isValidObjectId(batchId)) return { status: 400, error: 'That batch id is not valid.' };
    const batch = await Batch.findOne({ ...scope, _id: batchId }).select('_id name');
    return batch ? { batch } : { status: 403, error: 'You can only add notes to a batch of this programme that you teach.' };
  }
  const candidates = await Batch.find(scope).select('_id name').limit(2);
  if (candidates.length === 1) return { batch: candidates[0] };
  if (!candidates.length) return { status: 403, error: 'Teacher notes go to a batch, and you are not teaching one of this programme.' };
  return { status: 400, error: 'Pick the batch these notes are for.' };
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
  const mine = summary ? [] : await studentBatchesOf(req.user);
  res.json({ programs: programs.map((p) => (summary ? withoutBlockedModules(p, req.user) : forViewer(p, req.user, mine))) });
});

// GET /api/lms/programs/:id — full curriculum tree, members only.
router.get('/:id', requireAuth, async (req, res) => {
  const program = await Program.findById(req.params.id);
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  if (!(await canViewProgram(req.user, program))) return res.status(403).json({ error: 'Forbidden.' });
  res.json({ program: forViewer(program, req.user, await studentBatchesOf(req.user)) });
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

// ── Reading materials ───────────────────────────────────────────────────────
// The one thing a mentor does to the curriculum week after week is put the
// handouts up, so it gets its own two routes that save at once — no tree to
// understand, no Save button to forget, and no whole-tree PATCH from a
// mentor's screen that could overwrite an admin's edit in flight.
//
// A material lands on ONE node: the week (moduleId), the session (moduleId +
// chapterId) or the lesson (all three). The student's Reading material chip
// lists everything on the lesson, its session and its week together.

/** The week, session or lesson the ids point at, as a live subdocument. */
function findNode(program, { moduleId, chapterId, topicId } = {}) {
  const m = moduleId && mongoose.isValidObjectId(moduleId) ? program.modules.id(moduleId) : null;
  if (!m) return null;
  if (!chapterId) return m;
  const c = mongoose.isValidObjectId(chapterId) ? m.chapters.id(chapterId) : null;
  if (!c) return null;
  if (!topicId) return c;
  return (mongoose.isValidObjectId(topicId) && c.topics.id(topicId)) || null;
}

// A pasted link has to be something a browser can open. Root-relative
// /uploads/… paths are ours and fine; anything else must be http(s).
const isOpenableLink = (u) => /^https?:\/\/\S+$/i.test(u) || /^\/uploads\/[a-f0-9]{24}$/i.test(u);

// POST /api/lms/programs/:id/materials — multipart: files[] (up to 20; PDF,
// Word, Excel, PowerPoint, images, text — whatever storeCurriculumFile takes),
// moduleId, chapterId?, topicId?, kind ('notes' default | 'resource'), and
// optionally url + name for a link instead of (or as well as) files.
// Returns the node's full list.
router.post('/:id/materials', requireAuth, requireRole('admin', 'mentor'), (req, res) => {
  materialUpload.array('files', MAX_MATERIALS_PER_PUSH)(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'One of those files is over the 15 MB limit.' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: `Add up to ${MAX_MATERIALS_PER_PUSH} files at a time.` });
      return res.status(400).json({ error: 'Upload failed.' });
    }
    const program = await Program.findById(req.params.id);
    if (!program) return res.status(404).json({ error: 'Program not found.' });
    if (!(await canEditProgram(req.user, program))) return res.status(403).json({ error: 'Only mentors assigned to this program can add its reading materials.' });
    const node = findNode(program, req.body || {});
    if (!node) return res.status(404).json({ error: 'That week, session or lesson was not found. Reload and try again.' });
    // Notes are for one cohort: the one this mentor taught (utils/materialScope).
    const target = await pushTarget(req.user, program, String(req.body?.batchId || '').trim());
    if (target.error) return res.status(target.status).json({ error: target.error });
    const batchIds = [target.batch._id];

    const files = req.files || [];
    const link = String(req.body?.url || '').trim();
    const kind = req.body?.kind === 'resource' ? 'resource' : 'notes';
    if (!files.length && !link) return res.status(400).json({ error: 'Nothing to add: choose at least one file or paste a link.' });
    // Every file is read before any is stored, so one bad file in a drop of
    // five refuses the drop rather than leaving four of them half-added.
    const types = files.map(curriculumFileType);
    const refused = files.find((_, i) => !types[i]);
    if (refused) return res.status(415).json({ error: `${refused.originalname || 'That file'} can't be added. ${CURRICULUM_FILE_REFUSAL}` });
    if (link && !isOpenableLink(link)) return res.status(400).json({ error: 'That link must start with https://.' });

    try {
      // The same file pushed twice onto the same node is one entry. Pushed
      // for a second batch, that entry gains the batch rather than a twin.
      // An entry from before per-batch notes is first pinned to the batches
      // that already see it, so widening it never takes it from them.
      const programBatches = await Batch.find({ programId: program._id }).select('_id createdAt').lean();
      const forBatch = programBatches.find((b) => String(b._id) === String(target.batch._id));
      const place = (url, entry) => {
        const have = node.materials.find((x) => x.url === url);
        if (!have) { node.materials.push({ ...entry, batchIds }); return 1; }
        if (materialInBatch(have, forBatch)) return 0;
        if (!(have.batchIds || []).length) have.batchIds = programBatches.filter((b) => materialInBatch(have, b)).map((b) => b._id);
        have.batchIds.push(forBatch._id);
        return 1;
      };
      let added = 0;
      for (const [i, f] of files.entries()) {
        const { url, name } = await storeCurriculumFile(f, req.user._id, types[i]);
        added += place(url, { url, name, kind, addedBy: req.user._id });
      }
      if (link) {
        added += place(link, { url: link, name: String(req.body?.name || '').trim() || link, kind, addedBy: req.user._id });
      }
      await program.save();
      return res.status(201).json({ materials: node.materials, added });
    } catch {
      return res.status(500).json({ error: 'Could not store the file.' });
    }
  });
});

// DELETE /api/lms/programs/:id/materials/:mid — remove one material wherever
// it sits in the tree. The stored bytes stay: they are hash-shared and may be
// attached elsewhere. Returns the node's remaining list.
router.delete('/:id/materials/:mid', requireAuth, requireRole('admin', 'mentor'), async (req, res) => {
  const program = await Program.findById(req.params.id);
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  if (!(await canEditProgram(req.user, program))) return res.status(403).json({ error: 'Only mentors assigned to this program can edit its reading materials.' });
  const mid = String(req.params.mid);
  const nodes = program.modules.flatMap((m) => [m, ...m.chapters.flatMap((c) => [c, ...c.topics])]);
  const node = nodes.find((n) => (n.materials || []).some((x) => String(x._id) === mid));
  if (!node) return res.status(404).json({ error: 'That material is already gone.' });
  // Removed while looking at one batch, a note pushed to several leaves only
  // that batch; the others keep it. Otherwise it goes outright.
  const batchId = String(req.query.batchId || '');
  const m = node.materials.id(mid);
  const others = (m.batchIds || []).filter((b) => String(b) !== batchId);
  if (batchId && others.length && others.length < (m.batchIds || []).length) m.batchIds = others;
  else node.materials.pull(mid);
  await program.save();
  res.json({ materials: node.materials });
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
