import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { Certificate } from '../models/Certificate.js';
import { certificateEmail } from '../utils/emailTemplates.js';
import { trySendMail } from '../utils/email.js';
import { issueCertificate, publicView, qrDataUri, verifyUrl } from '../utils/certificates.js';
import { rateLimit } from '../utils/rateLimit.js';

const router = Router();

/* ───────────────────────── public ─────────────────────────
   Everything above this line in the file is the only part of the API a person
   with no account can reach. Keep it that way: the route below is linked from
   a QR code printed on paper, so it will be opened by recruiters, by bots, and
   eventually by someone trying every code they can think of. */

// GET /api/lms/certificates/verify/:code — is this certificate real?
//
// No auth, by design. A credential nobody can check without an account is not
// a credential. What keeps it safe is the shape of the answer, not a login:
// publicView() is an allowlist of four facts, the code has 40 bits of entropy
// so the collection cannot be walked, and the rate limit below makes trying
// anyway pointless.
router.get('/verify/:code', async (req, res) => {
  // Per IP, generous enough for a real person checking a handful of
  // applicants' certificates in a sitting and useless for a script.
  if (!(await rateLimit(`verify:${req.ip}`, 30, 60_000))) {
    return res.status(429).json({ error: 'Too many lookups. Try again shortly.' });
  }

  // Uppercased and de-spaced before lookup: this code gets read off paper and
  // typed by hand, and "mnlr 7k3p 9qxz" is the same certificate.
  const code = String(req.params.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const cert = await Certificate.findOne({ code });

  // A 404 says "no such certificate", which is the honest answer and also the
  // one that tells an enumerator nothing they did not already know.
  if (!cert) return res.status(404).json({ valid: false, error: 'No certificate with that ID.' });
  res.json(publicView(cert));
});

/* ───────────────────────── student ───────────────────────── */

// GET /api/lms/certificates/mine — what I hold, with the QR to print.
router.get('/mine', requireAuth, async (req, res) => {
  const certs = await Certificate.find({ studentId: req.user._id }).sort({ issuedAt: -1 });
  const out = await Promise.all(
    certs.map(async (c) => ({
      ...publicView(c),
      verifyUrl: verifyUrl(c.code),
      qr: await qrDataUri(c.code),
    })),
  );
  res.json({ certificates: out });
});

/* ───────────────────────── admin ───────────────────────── */

// GET /api/lms/certificates?batchId= — who in this cohort has one.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { batchId } = req.query;
  const filter = batchId ? { batchId } : {};
  const certs = await Certificate.find(filter)
    .sort({ issuedAt: -1 })
    .limit(500)
    .populate('studentId', 'fullName email');
  res.json({
    certificates: certs.map((c) => ({
      id: c._id,
      code: c.code,
      name: c.studentName,
      email: c.studentId?.email || '',
      programme: c.programTitle,
      batch: c.batchName,
      issuedAt: c.issuedAt,
      revoked: Boolean(c.revokedAt),
      verifyUrl: verifyUrl(c.code),
    })),
  });
});

// POST /api/lms/certificates/issue { batchId, send } — issue to a whole cohort.
//
// Issuing and emailing are separate switches on purpose. Issuing is reversible
// in practice (nobody has seen the code yet); sending is not — once thirty
// people have the mail you cannot unsend it. So the default is to mint the
// certificates, let the admin read the list back, and send as a second act.
router.post('/issue', requireAuth, requireRole('admin'), async (req, res) => {
  const { batchId, send = false } = req.body || {};
  if (!batchId) return res.status(400).json({ error: 'batchId is required.' });

  const batch = await Batch.findById(batchId)
    .populate('programId', 'title')
    .populate('studentIds', 'fullName email');
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });
  if (!batch.programId) return res.status(400).json({ error: 'That batch has no programme.' });

  const students = batch.studentIds || [];
  if (!students.length) return res.json({ ok: true, issued: 0, sent: 0, results: [] });

  const results = [];
  for (const student of students) {
    const { cert, created } = await issueCertificate({
      student,
      program: batch.programId,
      batch,
      issuedBy: req.user._id,
    });
    results.push({
      email: student.email,
      name: cert.studentName,
      code: cert.code,
      created,
      verifyUrl: verifyUrl(cert.code),
      sent: false,
      error: '',
    });
  }

  /* The send is sequential and deliberately not Promise.all: a cohort is tens
     of people, the provider rate-limits bursts, and one refused address must
     not abort the other twenty-nine. trySendMail already swallows its own
     failure, so a bad address is recorded against that row and the loop
     continues. */
  let sent = 0;
  if (send) {
    for (const row of results) {
      if (!row.email) { row.error = 'No email address on the account.'; continue; }
      const mail = await trySendMail({
        to: row.email,
        ...certificateEmail({
          fullName: row.name,
          email: row.email,
          programme: batch.programId.title,
          batchName: batch.name,
          code: row.code,
          verifyUrl: row.verifyUrl,
        }),
      });
      /* trySendMail never throws. It returns { emailed: true } on a send,
         { error } on a refusal, and { dev: true } when no transport is
         configured at all — which logs the message and sends nothing. That
         last case has to be reported as not-sent, or an admin on a server with
         no Resend key reads "sent 30" and believes it. */
      if (mail.emailed) { row.sent = true; sent++; }
      else if (mail.dev) row.error = 'Mail is not configured on this server — the message was logged, not sent.';
      else row.error = mail.error || 'Send failed.';
    }
  }

  res.json({
    ok: true,
    batch: batch.name,
    programme: batch.programId.title,
    issued: results.filter((r) => r.created).length,
    existing: results.filter((r) => !r.created).length,
    sent,
    results,
  });
});

// POST /api/lms/certificates/:id/revoke { reason }
//
// Revoked, never deleted. A certificate that has been shared and then
// withdrawn still has to resolve: a verification page that 404s reads as "we
// lost the record", while one that says revoked is the answer the person
// scanning it actually needs.
router.post('/:id/revoke', requireAuth, requireRole('admin'), async (req, res) => {
  const cert = await Certificate.findById(req.params.id);
  if (!cert) return res.status(404).json({ error: 'Certificate not found.' });
  cert.revokedAt = new Date();
  cert.revokedReason = String(req.body?.reason || '').slice(0, 300);
  await cert.save();
  res.json({ ok: true, code: cert.code, revoked: true });
});

export default router;
