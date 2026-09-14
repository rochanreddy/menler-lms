import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { Certificate } from '../models/Certificate.js';
import { certificateEmail } from '../utils/emailTemplates.js';
import { trySendMail } from '../utils/email.js';
import { issueCertificate, publicView, qrDataUri, sampleCode, studentCanSee, verifyUrl } from '../utils/certificates.js';
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
  const certs = (await Certificate.find({ studentId: req.user._id }).sort({ issuedAt: -1 }))
    // A minted-but-unsent certificate is not yet the student's news to have.
    .filter(studentCanSee);
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
      sentAt: c.sentAt,
      revoked: Boolean(c.revokedAt),
      verifyUrl: verifyUrl(c.code),
    })),
  });
});

// GET /api/lms/certificates/:id — one certificate, as the student will see it.
//
// Separate from the list because the QR is ~2.6 KB of inline SVG each: putting
// it on every row would push a 200-student cohort past half a megabyte for a
// table that shows none of them. So the list stays text and the sheet is
// fetched when an admin actually opens one.
//
// Declared after /mine and /verify/:code, which are literal paths and would
// otherwise be swallowed by :id.
router.get('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const cert = await Certificate.findById(req.params.id);
  if (!cert) return res.status(404).json({ error: 'Certificate not found.' });
  res.json({
    certificate: {
      name: cert.studentName,
      program: cert.programTitle,
      batch: cert.batchName || null,
      issuedAt: cert.issuedAt,
      certId: cert.code,
      mentorName: cert.mentorName || null,
      mentorRole: cert.mentorRole || null,
      revoked: Boolean(cert.revokedAt),
      verifyUrl: verifyUrl(cert.code),
      qr: await qrDataUri(cert.code),
    },
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
    .populate('studentIds', 'fullName email')
    // The mentor signs the certificate — see mentorFor() in utils/certificates.
    .populate('mentorIds', 'fullName email professional');
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
      if (mail.emailed) {
        row.sent = true;
        sent++;
        /* Stamped only on a real send. This is what releases the certificate
           to the student, so a failed or unconfigured send must leave it
           hidden rather than quietly revealing something nobody was told
           about. */
        await Certificate.updateOne({ code: row.code }, { sentAt: new Date() });
      }
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

/* ─────────────────── sampling ───────────────────
   Both routes below write nothing: no certificate row, no counter increment,
   no sentAt. A sample exists to answer "does this read correctly" before a
   cohort is emailed, and a check that alters the thing it is checking is not
   one. */

/** Resolve a programme and batch by id, tolerating either being absent. */
async function sampleContext({ programId, batchId }) {
  const batch = batchId ? await Batch.findById(batchId).populate('programId', 'title') : null;
  const program = batch?.programId || (programId ? await Program.findById(programId).select('title') : null);
  return { program: program || { title: 'Generalist' }, batch };
}

// POST /api/lms/certificates/sample { name, programId, batchId }
// The sheet, with any name on it, for looking at.
router.post('/sample', requireAuth, requireRole('admin'), async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  const { program, batch } = await sampleContext(req.body || {});
  const code = sampleCode(program, batch);
  const { mentorFor } = await import('../utils/certificates.js');
  const { mentorName, mentorRole } = await mentorFor(batch);

  res.json({
    certificate: {
      name,
      program: program.title,
      batch: batch?.name || null,
      issuedAt: new Date(),
      certId: code,
      mentorName: mentorName || null,
      mentorRole: mentorRole || null,
      sample: true,
      verifyUrl: verifyUrl(code),
      qr: await qrDataUri(code),
    },
  });
});

// POST /api/lms/certificates/sample-email { name, email, programId, batchId }
// The same sample, delivered, so the mail can be read in a real inbox.
router.post('/sample-email', requireAuth, requireRole('admin'), async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!name || !email) return res.status(400).json({ error: 'A name and an email address are required.' });
  if (!/^[^@s]+@[^@s]+.[^@s]+$/.test(email)) return res.status(400).json({ error: 'That does not look like an email address.' });

  // It sends mail, so it is worth a ceiling — a test button is exactly the
  // kind of thing that gets pressed twenty times in a row.
  if (!(await rateLimit(`sample-mail:${req.user._id}`, 10, 10 * 60_000))) {
    return res.status(429).json({ error: 'Too many test emails. Try again in a few minutes.' });
  }

  const { program, batch } = await sampleContext(req.body || {});
  const code = sampleCode(program, batch);
  const mail = await trySendMail({
    to: email,
    ...certificateEmail({
      fullName: name,
      email,
      programme: program.title,
      batchName: batch?.name || '',
      code,
      verifyUrl: verifyUrl(code),
      sample: true,
    }),
  });

  if (mail.emailed) return res.json({ ok: true, sent: true, to: email, code });
  return res.json({
    ok: false,
    sent: false,
    to: email,
    code,
    error: mail.dev
      ? 'No mail transport is configured on this server — the message was logged, not sent.'
      : mail.error || 'Send failed.',
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
