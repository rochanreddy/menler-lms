import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Progress } from '../models/Progress.js';
import { Program } from '../models/Program.js';
import { issueCertificate, qrDataUri, verifyUrl } from '../utils/certificates.js';
import { Certificate } from '../models/Certificate.js';
import { Batch } from '../models/Batch.js';

const router = Router();

const totalTopics = (program) =>
  (program.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((c, ch) => c + (ch.topics || []).length, 0), 0);

// Does this topicId actually belong to this program's tree? Guards toggle
// below against arbitrary ids being pushed into completedTopics.
const hasTopic = (program, topicId) =>
  (program.modules || []).some((m) => (m.chapters || []).some((c) => (c.topics || []).some((t) => String(t._id) === topicId)));

// GET /api/lms/progress/me?programId= — the student's completion for one program.
router.get('/me', requireAuth, async (req, res) => {
  const { programId } = req.query;
  if (!programId) return res.json({ completedTopics: [], total: 0, completed: 0, pct: 0, certificateIssuedAt: null });
  const program = await Program.findById(programId).select('modules title');
  const total = program ? totalTopics(program) : 0;
  const p = await Progress.findOne({ studentId: req.user._id, programId });
  const completedTopics = p?.completedTopics || [];
  const completed = Math.min(completedTopics.length, total);
  res.json({ completedTopics, total, completed, pct: total ? Math.round((completed / total) * 100) : 0, certificateIssuedAt: p?.certificateIssuedAt || null });
});

// POST /api/lms/progress/toggle { programId, topicId } — mark a lesson (in)complete.
router.post('/toggle', requireAuth, async (req, res) => {
  const { programId, topicId } = req.body || {};
  if (!programId || !topicId) return res.status(400).json({ error: 'programId and topicId are required.' });

  const program = await Program.findById(programId).select('modules');
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  const id = String(topicId);
  if (!hasTopic(program, id)) return res.status(400).json({ error: 'That lesson does not belong to this program.' });
  if (!(await Batch.exists({ programId, studentIds: req.user._id }))) {
    return res.status(403).json({ error: 'You are not enrolled in this program.' });
  }

  let p = await Progress.findOne({ studentId: req.user._id, programId });
  if (!p) p = await Progress.create({ studentId: req.user._id, programId, completedTopics: [] });
  const has = p.completedTopics.includes(id);
  p.completedTopics = has ? p.completedTopics.filter((t) => t !== id) : [...p.completedTopics, id];
  await p.save();
  res.json({ completedTopics: p.completedTopics, completed: !has });
});

// GET /api/lms/progress/certificate?programId= — issues a certificate at 100%.
router.get('/certificate', requireAuth, async (req, res) => {
  const { programId } = req.query;
  const program = await Program.findById(programId).select('modules title');
  if (!program) return res.status(404).json({ error: 'Program not found.' });
  const total = totalTopics(program);
  const p = await Progress.findOne({ studentId: req.user._id, programId });
  const completed = Math.min(p?.completedTopics?.length || 0, total);

  /* A certificate that has already been issued is always viewable, whatever
     the progress bar says. The completion gate decides who EARNS one; it has
     no business deciding who may look at one they already hold. An admin
     issuing to a cohort is exactly that case — those students are handed a
     certificate without having ticked every topic, and before this they could
     be emailed a code for a certificate the app then refused to show them. */
  const held = await Certificate.findOne({ studentId: req.user._id, programId });
  if (held) {
    return res.json({
      eligible: true,
      program: program.title,
      name: held.studentName,
      batch: held.batchName || null,
      issuedAt: held.issuedAt,
      certId: held.code,
      revoked: Boolean(held.revokedAt),
      verifyUrl: verifyUrl(held.code),
      qr: await qrDataUri(held.code),
    });
  }

  if (!(total > 0 && completed >= total)) return res.json({ eligible: false, completed, total });
  let issuedAt = p.certificateIssuedAt;
  if (!issuedAt) { p.certificateIssuedAt = new Date(); await p.save(); issuedAt = p.certificateIssuedAt; }

  /* The id here used to be MNLR- plus the tail of the progress ObjectId,
     computed on the way out and stored nowhere. That made it a decoration:
     there was nothing to look up, so nobody outside the app could check the
     certificate was real — and an ObjectId's tail is near enough sequential
     that holding one would have let you guess other people's.

     Both paths now go through the same issuer, so a certificate claimed by
     finishing the course and one issued to a cohort are the same object, with
     a stored random code and a QR that resolves.

     The batch is whichever cohort of this programme the student sits in. It is
     there for the certificate to name, not to gate on: someone who worked
     through the curriculum without a batch row has still earned this, the
     certificate just does not carry a cohort line. */
  const batch = await Batch.findOne({ programId: program._id, studentIds: req.user._id });
  const { cert } = await issueCertificate({ student: req.user, program, batch });

  res.json({
    eligible: true,
    program: program.title,
    name: cert.studentName,
    batch: cert.batchName || null,
    issuedAt: cert.issuedAt,
    certId: cert.code,
    verifyUrl: verifyUrl(cert.code),
    qr: await qrDataUri(cert.code),
  });
});

export default router;
