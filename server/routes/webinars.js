import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { MAX_CURRICULUM_BYTES, isPdfUpload, storeCurriculumPdf } from '../utils/curriculumFiles.js';
import { Webinar } from '../models/Webinar.js';
import { WebinarResource } from '../models/WebinarResource.js';
import { User } from '../models/User.js';
import { notifyMany } from '../utils/notify.js';

const router = Router();

/** Who is told about a masterclass: every student, and no one else.
 *
 *  Webinars are not batch-scoped — a guest session is worth the same to either
 *  cohort — so this is every student there is, with no batch filter. Mentors
 *  and admins see the same tab and the same list; they are simply not pushed
 *  at. The bell is the student's: a mentor hears about a masterclass from the
 *  admin who booked it, and a notification they did not need is what teaches
 *  them to stop reading the ones they did. */
async function audience() {
  const rows = await User.find({ role: 'student' }).select('_id').lean();
  return rows.map((u) => u._id);
}

const whenLabel = (startsAt) => (startsAt
  ? ` — ${new Date(startsAt).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST`
  : '');

// GET /api/lms/webinars — everyone sees the list (newest first).
router.get('/', requireAuth, async (_req, res) => {
  res.json({ webinars: await Webinar.find().sort({ startsAt: -1, createdAt: -1 }) });
});

// POST /api/lms/webinars — admin schedules (mentors can only join).
//
// Scheduling one notifies every student. Without this the webinar
// existed only for whoever thought to open the tab, which is how the feature
// sat unseen: a masterclass nobody is told about is a masterclass nobody
// attends.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, description, startsAt, joinUrl, pptUrl, recordingUrl } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const webinar = await Webinar.create({ title, description: description || '', startsAt: startsAt || null, joinUrl: joinUrl || '', pptUrl: pptUrl || '', recordingUrl: recordingUrl || '' });
  const people = await audience();
  await notifyMany(people, {
    type: 'webinar',
    text: `Masterclass: ${title}${whenLabel(startsAt)}`,
    link: '/app/webinar',
  });
  res.status(201).json({ webinar, notified: people.length });
});

// PATCH /api/lms/webinars/:id — admin edit (add slides/recording).
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const allowed = (({ title, description, startsAt, joinUrl, pptUrl, recordingUrl }) => ({ title, description, startsAt, joinUrl, pptUrl, recordingUrl }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const before = await Webinar.findById(req.params.id).select('recordingUrl');
  if (!before) return res.status(404).json({ error: 'Webinar not found.' });
  const webinar = await Webinar.findByIdAndUpdate(req.params.id, allowed, { new: true });

  // The recording landing is the one edit worth interrupting people for: it is
  // what everybody who missed the session is waiting on. Only when it goes from
  // absent to present, so re-saving the same link stays silent.
  if (!before.recordingUrl && webinar.recordingUrl) {
    await notifyMany(await audience(), {
      type: 'webinar',
      text: `Recording is up: ${webinar.title}`,
      link: '/app/webinar',
    });
  }
  res.json({ webinar });
});

// ── Resources ───────────────────────────────────────────────────────────────
//
// The deck, the cheat sheet, the prompt pack: whatever went out with the
// session. They go through the SAME hash-deduped store as course PDFs
// (`storeCurriculumPdf`), so a deck that is both a lesson's reading and a
// masterclass resource is stored once, and every upload is checked for the
// `%PDF-` header rather than trusting the type the browser declared.
const MAX_RESOURCES_PER_PUSH = 10;
const resourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CURRICULUM_BYTES, files: MAX_RESOURCES_PER_PUSH },
});

// A pasted link has to be something a browser can open. Root-relative
// /uploads/… paths are ours and fine; anything else must be http(s).
const isOpenableLink = (u) => /^https?:\/\/\S+$/i.test(u) || /^\/uploads\/[a-f0-9]{24}$/i.test(u);

// Both resource endpoints refuse the same things for the same reasons, so the
// checks live here rather than being copied and drifting apart.
function uploadError(err) {
  if (!err) return null;
  if (err.code === 'LIMIT_FILE_SIZE') return { status: 413, error: 'One of those files is over the 15 MB limit.' };
  if (err.code === 'LIMIT_FILE_COUNT') return { status: 413, error: `Add up to ${MAX_RESOURCES_PER_PUSH} files at a time.` };
  return { status: 400, error: 'Upload failed.' };
}

function validateResources(files, link) {
  if (!files.length && !link) return { status: 400, error: 'Nothing to add: choose at least one PDF or paste a link.' };
  const notPdf = files.find((f) => !isPdfUpload(f));
  if (notPdf) return { status: 415, error: `${notPdf.originalname || 'That file'} is not a PDF. Only PDF files are accepted.` };
  if (link && !isOpenableLink(link)) return { status: 400, error: 'That link must start with https://.' };
  return null;
}

// ── The shelf ───────────────────────────────────────────────────────────────
//
// Resources that belong to the tab rather than to one masterclass. Declared
// BEFORE /:id/resources so "shelf" is never read as a webinar id.
//
// GET is everyone's; the rest is the admin's, like scheduling.
router.get('/shelf', requireAuth, async (_req, res) => {
  res.json({ resources: await WebinarResource.find().sort({ createdAt: 1 }) });
});

router.post('/shelf', requireAuth, requireRole('admin'), (req, res) => {
  resourceUpload.array('files', MAX_RESOURCES_PER_PUSH)(req, res, async (err) => {
    const bad = uploadError(err);
    if (bad) return res.status(bad.status).json({ error: bad.error });

    const files = req.files || [];
    const link = String(req.body?.url || '').trim();
    const refuse = validateResources(files, link);
    if (refuse) return res.status(refuse.status).json({ error: refuse.error });

    try {
      const have = new Set((await WebinarResource.find().select('url').lean()).map((r) => r.url));
      let added = 0;
      for (const f of files) {
        const { url, name } = await storeCurriculumPdf(f, req.user._id);
        if (have.has(url)) continue;
        await WebinarResource.create({ url, name, addedBy: req.user._id });
        have.add(url);
        added++;
      }
      if (link && !have.has(link)) {
        await WebinarResource.create({ url: link, name: String(req.body?.name || '').trim() || link, addedBy: req.user._id });
        added++;
      }
      return res.status(201).json({ resources: await WebinarResource.find().sort({ createdAt: 1 }), added });
    } catch {
      return res.status(500).json({ error: 'Could not store the file.' });
    }
  });
});

router.delete('/shelf/:rid', requireAuth, requireRole('admin'), async (req, res) => {
  // The stored bytes stay: they are hash-shared with the curriculum.
  const gone = await WebinarResource.findByIdAndDelete(req.params.rid);
  if (!gone) return res.status(404).json({ error: 'That resource is already gone.' });
  res.json({ resources: await WebinarResource.find().sort({ createdAt: 1 }) });
});

// POST /api/lms/webinars/:id/resources — multipart: files[] (PDFs, up to 10),
// or url + name for a link. Returns the webinar's full list.
//
// Adding one notifies nobody. The recording is the single edit worth
// interrupting people for; a deck going up a day later is something a student
// finds when they open the masterclass, and a bell for every file is how the
// bell stops being read.
router.post('/:id/resources', requireAuth, requireRole('admin'), (req, res) => {
  resourceUpload.array('files', MAX_RESOURCES_PER_PUSH)(req, res, async (err) => {
    const bad = uploadError(err);
    if (bad) return res.status(bad.status).json({ error: bad.error });
    const webinar = await Webinar.findById(req.params.id);
    if (!webinar) return res.status(404).json({ error: 'Webinar not found.' });

    const files = req.files || [];
    const link = String(req.body?.url || '').trim();
    const refuse = validateResources(files, link);
    if (refuse) return res.status(refuse.status).json({ error: refuse.error });

    try {
      let added = 0;
      for (const f of files) {
        const { url, name } = await storeCurriculumPdf(f, req.user._id);
        // The same file pushed twice onto the same masterclass is one entry.
        if (webinar.resources.some((x) => x.url === url)) continue;
        webinar.resources.push({ url, name, addedBy: req.user._id });
        added++;
      }
      if (link && !webinar.resources.some((x) => x.url === link)) {
        webinar.resources.push({ url: link, name: String(req.body?.name || '').trim() || link, addedBy: req.user._id });
        added++;
      }
      await webinar.save();
      return res.status(201).json({ webinar, added });
    } catch {
      return res.status(500).json({ error: 'Could not store the file.' });
    }
  });
});

// DELETE /api/lms/webinars/:id/resources/:rid — take one off the list. The
// stored bytes stay: they are hash-shared with the curriculum, so deleting
// them here could empty a lesson's reading slot.
router.delete('/:id/resources/:rid', requireAuth, requireRole('admin'), async (req, res) => {
  const webinar = await Webinar.findById(req.params.id);
  if (!webinar) return res.status(404).json({ error: 'Webinar not found.' });
  if (!webinar.resources.id(req.params.rid)) return res.status(404).json({ error: 'That resource is already gone.' });
  webinar.resources.pull(req.params.rid);
  await webinar.save();
  res.json({ webinar });
});

export default router;
