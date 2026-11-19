/**
 * Re-send the certificate email to named students.
 *
 *   node scripts/resendCertificates.js a@x.com b@y.com            # dry run
 *   CONFIRM_DB=menler LMS_APP_URL=https://lms.menler.in \
 *     node scripts/resendCertificates.js a@x.com b@y.com --apply  # send
 *
 * The admin page's Email button only appears on a certificate that has never
 * been sent, which is right for a cohort and wrong for "the PDF you downloaded
 * was broken, please download it again". This sends the same mail, from the
 * same template and transport, to the addresses named and nobody else.
 *
 * Writes nothing: sentAt keeps the first send, because that is when the
 * certificate was released to the student. Revoked certificates are skipped.
 *
 * Refuses to send while LMS_APP_URL points at localhost — a local .env does,
 * and every link in the mail would then open the sender's laptop.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Certificate } from '../models/Certificate.js';
import { certificateEmail } from '../utils/emailTemplates.js';
import { trySendMail } from '../utils/email.js';
import { verifyUrl } from '../utils/certificates.js';
import { appUrl } from '../utils/appUrl.js';

const apply = process.argv.includes('--apply');
const emails = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((e) => e.trim().toLowerCase());
if (!emails.length) {
  console.error('Name at least one email address.');
  process.exit(1);
}

await connectDb();
const db = mongoose.connection.name;
if (apply && process.env.CONFIRM_DB !== db) {
  console.error(`Refusing to send: set CONFIRM_DB=${db} to confirm the database.`);
  process.exit(1);
}
if (apply && /localhost|127\.0\.0\.1/.test(appUrl('/'))) {
  console.error(`Refusing to send: links would point at ${appUrl('/')}. Set LMS_APP_URL=https://lms.menler.in`);
  process.exit(1);
}

console.log(`${apply ? 'SENDING' : 'DRY RUN'} on ${db}; links → ${appUrl('/app/profile')}\n`);

for (const email of emails) {
  const user = await User.findOne({ email });
  if (!user) { console.log(`✗ ${email}: no account`); continue; }
  const certs = await Certificate.find({ studentId: user._id, revokedAt: null }).sort({ issuedAt: -1 });
  if (!certs.length) { console.log(`✗ ${email}: no live certificate`); continue; }

  for (const c of certs) {
    const line = `${email} · ${c.studentName} · ${c.code} · ${c.programTitle} · ${c.batchName || '—'}`;
    if (!apply) { console.log(`• would send ${line}`); continue; }
    const mail = await trySendMail({
      to: email,
      ...certificateEmail({
        fullName: c.studentName,
        email,
        programme: c.programTitle,
        batchName: c.batchName,
        code: c.code,
        verifyUrl: verifyUrl(c.code),
      }),
    });
    if (mail.emailed) console.log(`✓ sent ${line}`);
    else console.log(`✗ ${line}: ${mail.dev ? 'no mail transport configured — logged, not sent' : mail.error}`);
  }
}

await mongoose.disconnect();
