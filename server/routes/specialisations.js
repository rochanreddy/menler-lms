import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Specialisation, SpecialisationAllotment } from '../models/Specialisation.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { Progress } from '../models/Progress.js';
import { notifyMany } from '../utils/notify.js';
import { PROGRAMME_TITLES, titleQuery } from '../utils/programmes.js';
import {
  SyllabusError, cleanModules, cleanResources, ensureSpecialisations, syllabusCounts, LIMITS,
} from '../utils/specialisations.js';

// Specialisations: what a student takes up after the six weeks of the AI
// Generalist. The admin runs all of it from one tab — who is in which track,
// and each track's syllabus, reading and teacher notes — and none of it is
// wired into batches, sessions, assignments or the Learning tab. A student
// allotted to one gets their own tab and reads it there (GET /mine).
//
// Who can see what:
//   admin    everything, and is the only one who can change anything
//   student  their own specialisation, through /mine, and nothing else
//   mentor   nothing (no mentor teaches a specialisation yet)

const router = Router();

const MAX_PER_ALLOT = 500;

const listOrder = { order: 1, createdAt: 1 };

async function allSpecialisations() {
  await ensureSpecialisations(Specialisation);
  return Specialisation.find().sort(listOrder).lean();
}

/** The AI Generalist programme and its batches, newest first. */
async function generalist() {
  const program = await Program.findOne(titleQuery(PROGRAMME_TITLES.generalist)).select('_id title modules').lean();
  if (!program) return { program: null, batches: [] };
  const batches = await Batch.find({ programId: program._id })
    .select('name startDate endDate status studentIds createdAt')
    .sort({ startDate: -1, createdAt: -1 })
    .lean();
  return { program, batches };
}

const lessonTotal = (program) =>
  (program?.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((c, ch) => c + (ch.topics || []).length, 0), 0);

const allotmentOut = (a) => (a ? {
  status: a.status,
  specialisation_id: a.specialisationId ? String(a.specialisationId) : null,
  allotted_at: a.allottedAt,
} : null);

// GET /api/lms/specialisations — the six, each with how many students it has
// and how far its syllabus has got. Plus the two counts that are not a track:
// students who said no, and allotments in total.
router.get('/', requireAuth, requireRole('admin'), async (_req, res) => {
  const specs = await allSpecialisations();
  const counts = await SpecialisationAllotment.aggregate([
    { $group: { _id: { s: '$specialisationId', st: '$status' }, n: { $sum: 1 } } },
  ]);
  const inTrack = new Map();
  let optedOut = 0;
  for (const c of counts) {
    if (c._id.st === 'opted_out') optedOut += c.n;
    else if (c._id.s) inTrack.set(String(c._id.s), c.n);
  }
  res.json({
    specialisations: specs.map((s) => ({
      _id: s._id,
      key: s.key,
      title: s.title,
      description: s.description,
      updatedAt: s.updatedAt,
      students: inTrack.get(String(s._id)) || 0,
      ...syllabusCounts(s),
    })),
    opted_out: optedOut,
  });
});

// GET /api/lms/specialisations/candidates — every student in an AI Generalist
// batch, with where they stand, how far through the Generalist they got and
// whether it was certified, so the admin can allot from one list. Students
// already allotted who are in no Generalist batch (moved out, or put in by
// hand) are listed too: a roster that hides someone is how they get lost.
router.get('/candidates', requireAuth, requireRole('admin'), async (_req, res) => {
  const { program, batches } = await generalist();
  const allotments = await SpecialisationAllotment.find().lean();
  const byStudent = new Map(allotments.map((a) => [String(a.studentId), a]));

  const batchesOf = new Map();
  for (const b of batches) {
    for (const sid of b.studentIds || []) {
      const k = String(sid);
      if (!batchesOf.has(k)) batchesOf.set(k, []);
      batchesOf.get(k).push(String(b._id));
    }
  }
  const ids = [...new Set([...batchesOf.keys(), ...byStudent.keys()])];
  const users = await User.find({ _id: { $in: ids }, role: 'student' }).select('fullName email blocked.lms').lean();

  const total = lessonTotal(program);
  const progress = program
    ? await Progress.find({ programId: program._id, studentId: { $in: users.map((u) => u._id) } }).select('studentId completedTopics certificateIssuedAt').lean()
    : [];
  const progressOf = new Map(progress.map((p) => [String(p.studentId), p]));

  res.json({
    programme: program ? { id: program._id, title: program.title, lessons: total } : null,
    batches: batches.map((b) => ({
      id: b._id, name: b.name, status: b.status, startDate: b.startDate, endDate: b.endDate, students: (b.studentIds || []).length,
    })),
    students: users
      .map((u) => {
        const k = String(u._id);
        const p = progressOf.get(k);
        const done = Math.min(p?.completedTopics?.length || 0, total);
        return {
          id: k,
          full_name: u.fullName || '',
          email: u.email,
          blocked: !!u.blocked?.lms,
          batch_ids: batchesOf.get(k) || [],
          progress: total ? Math.round((done / total) * 100) : 0,
          certified: !!p?.certificateIssuedAt,
          allotment: allotmentOut(byStudent.get(k)),
        };
      })
      .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
  });
});

// POST /api/lms/specialisations/allot { studentIds: [], to }
//   to = a specialisation id  → in that track (moved, if they were in another)
//   to = 'none'               → finished the Generalist, taking no track
//   to = ''                   → back to "not decided"
//
// A student who lands in a track — new, or moved — is told, with a link to
// their tab. Opting out and clearing tell nobody: there is nothing for them
// to go and open.
router.post('/allot', requireAuth, requireRole('admin'), async (req, res) => {
  const raw = Array.isArray(req.body?.studentIds) ? req.body.studentIds : [];
  const asked = [...new Set(raw.map(String))].filter((id) => mongoose.isValidObjectId(id));
  if (!asked.length) return res.status(400).json({ error: 'Pick at least one student.' });
  if (asked.length > MAX_PER_ALLOT) return res.status(400).json({ error: `Allot up to ${MAX_PER_ALLOT} students at a time.` });
  const students = await User.find({ _id: { $in: asked }, role: 'student' }).select('_id').lean();
  if (students.length !== asked.length) return res.status(400).json({ error: 'Only student accounts can be allotted. Reload and try again.' });
  const ids = students.map((s) => s._id);

  const to = String(req.body?.to ?? '');
  if (to === '') {
    await SpecialisationAllotment.deleteMany({ studentId: { $in: ids } });
    return res.json({ allotments: Object.fromEntries(asked.map((id) => [id, null])) });
  }

  let spec = null;
  if (to !== 'none') {
    spec = mongoose.isValidObjectId(to) ? await Specialisation.findById(to).select('title').lean() : null;
    if (!spec) return res.status(404).json({ error: 'That specialisation was not found. Reload and try again.' });
  }

  const before = new Map((await SpecialisationAllotment.find({ studentId: { $in: ids } }).lean()).map((a) => [String(a.studentId), a]));
  const now = new Date();
  const set = spec
    ? { specialisationId: spec._id, status: 'allotted' }
    : { specialisationId: null, status: 'opted_out' };
  // allottedAt moves only when where they stand moves, so re-saving the same
  // choice does not make an old allotment look new.
  await SpecialisationAllotment.bulkWrite(ids.map((id) => {
    const was = before.get(String(id));
    const same = was && was.status === set.status && String(was.specialisationId || '') === String(set.specialisationId || '');
    return {
      updateOne: {
        filter: { studentId: id },
        update: { $set: { ...set, ...(same ? {} : { allottedBy: req.user._id, allottedAt: now }) } },
        upsert: true,
      },
    };
  }));

  let notified = 0;
  if (spec) {
    const arriving = ids.filter((id) => String(before.get(String(id))?.specialisationId || '') !== String(spec._id));
    await notifyMany(arriving, {
      type: 'specialisation',
      text: `You’re in the ${spec.title} specialisation. Its syllabus and teacher notes go up on your Specialisation tab.`,
      link: '/app/specialisation',
    });
    notified = arriving.length;
  }

  const after = await SpecialisationAllotment.find({ studentId: { $in: ids } }).lean();
  res.json({
    allotments: Object.fromEntries(after.map((a) => [String(a.studentId), allotmentOut(a)])),
    notified,
  });
});

// GET /api/lms/specialisations/mine — a student's own track, whole, or why
// there is none. Anyone may ask; only a student can have an answer.
router.get('/mine', requireAuth, async (req, res) => {
  const a = req.user.role === 'student' ? await SpecialisationAllotment.findOne({ studentId: req.user._id }).lean() : null;
  if (!a || a.status !== 'allotted' || !a.specialisationId) {
    return res.json({ status: a?.status || null, specialisation: null });
  }
  const spec = await Specialisation.findById(a.specialisationId).lean();
  res.json({ status: spec ? 'allotted' : null, allotted_at: a.allottedAt, specialisation: spec });
});

// GET /api/lms/specialisations/:id — the whole track for the admin's editor:
// the syllabus as stored, and who is in it.
router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Specialisation not found.' });
  const spec = await Specialisation.findById(req.params.id).lean();
  if (!spec) return res.status(404).json({ error: 'Specialisation not found.' });
  res.json({ specialisation: spec, roster: await roster(spec._id) });
});

async function roster(specId) {
  const rows = await SpecialisationAllotment.find({ specialisationId: specId, status: 'allotted' }).sort({ allottedAt: 1 }).lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.studentId) }, role: 'student' }).select('fullName email').lean();
  const userOf = new Map(users.map((u) => [String(u._id), u]));
  const { batches } = await generalist();
  return rows
    .filter((r) => userOf.has(String(r.studentId)))
    .map((r) => {
      const u = userOf.get(String(r.studentId));
      return {
        id: String(u._id),
        full_name: u.fullName || '',
        email: u.email,
        allotted_at: r.allottedAt,
        batches: batches.filter((b) => (b.studentIds || []).some((s) => String(s) === String(u._id))).map((b) => b.name),
      };
    });
}

// PATCH /api/lms/specialisations/:id { title?, description?, modules?, resources?, version }
//
// The editor saves the whole syllabus at once and sends the `updatedAt` it
// last saw as `version`. If the track has moved on since (a second tab, a
// second admin), the write is refused with a 409 carrying what is stored
// now, rather than quietly putting back an older copy over someone's work.
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Specialisation not found.' });
  const body = req.body || {};
  const $set = {};
  try {
    if (body.title !== undefined) {
      const t = String(body.title).trim().slice(0, LIMITS.title);
      if (!t) return res.status(400).json({ error: 'A specialisation needs a name.' });
      $set.title = t;
    }
    if (body.description !== undefined) $set.description = String(body.description || '').trim().slice(0, LIMITS.description);
    if (body.modules !== undefined) $set.modules = cleanModules(body.modules);
    if (body.resources !== undefined) $set.resources = cleanResources(body.resources);
  } catch (e) {
    if (e instanceof SyllabusError) return res.status(400).json({ error: e.message });
    throw e;
  }
  if (!Object.keys($set).length) return res.status(400).json({ error: 'Nothing to save.' });

  const filter = { _id: req.params.id };
  if (body.version) {
    const v = new Date(body.version);
    if (!Number.isNaN(v.getTime())) filter.updatedAt = v;
  }
  const spec = await Specialisation.findOneAndUpdate(filter, { $set }, { new: true, runValidators: true }).lean();
  if (spec) return res.json({ specialisation: spec });

  const current = await Specialisation.findById(req.params.id).lean();
  if (!current) return res.status(404).json({ error: 'Specialisation not found.' });
  res.status(409).json({
    error: 'This specialisation was changed somewhere else (another tab?) since you opened it. The latest version is loaded — make your change again.',
    specialisation: current,
  });
});

export default router;
