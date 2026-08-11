// Seed a partner (B2B) test login + a sample job posting, so the partner-side
// screens (Post a Job, Applicants) have something to show.  Run:
//   npm run seed:partner            # create / ensure
//   npm run seed:partner -- --undo  # remove the account and its job
//
// Idempotent: re-running resets the password and leaves everything else alone.
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Job } from '../models/Job.js';
import { Application } from '../models/Application.js';

const EMAIL = process.env.LMS_PARTNER_EMAIL || 'partner@menler.in';
const PASSWORD = process.env.LMS_PARTNER_PASSWORD || 'Partner123!';
const COMPANY = 'Acme Technologies';

async function undo() {
  const user = await User.findOne({ email: EMAIL });
  if (!user) return console.log(`• Nothing to remove — no user ${EMAIL}`);
  const jobs = await Job.find({ postedBy: user._id }).select('_id');
  const jobIds = jobs.map((j) => j._id);
  // Applications first — orphaned rows would linger on the students' side.
  const apps = await Application.deleteMany({ jobId: { $in: jobIds } });
  await Job.deleteMany({ _id: { $in: jobIds } });
  await User.deleteOne({ _id: user._id });
  console.log(`✓ Removed ${EMAIL}, ${jobIds.length} job(s), ${apps.deletedCount} application(s)`);
}

async function seed() {
  let partner = await User.findOne({ email: EMAIL });
  if (partner) {
    // Re-running is the documented way to recover a forgotten test password.
    partner.passwordHash = await bcrypt.hash(PASSWORD, 12);
    partner.mustChangePassword = false;
    await partner.save();
    console.log(`• Partner already existed — password reset to: ${PASSWORD}`);
  } else {
    partner = await User.create({
      email: EMAIL,
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      fullName: 'Acme Hiring Team',
      role: 'partner',
      company: COMPANY,
      emailVerified: true,
      // Deliberately false: a test login shouldn't hit the forced-change wall.
      mustChangePassword: false,
    });
    console.log(`✓ Created partner: ${EMAIL} / ${PASSWORD}`);
  }

  if ((await Job.countDocuments({ postedBy: partner._id })) === 0) {
    await Job.create({
      title: 'Junior AI Engineer',
      company: COMPANY,
      description: 'Work alongside our platform team on retrieval and agent tooling. '
        + 'Open to recent graduates of the Kickstarter and Fellowship programs.',
      location: 'Hyderabad · Hybrid',
      applyUrl: '',
      postedBy: partner._id,
      open: true,
    });
    console.log('✓ Created sample job: Junior AI Engineer');
  }

  await fillCandidateProfiles();

  console.log(`\nLog in at /login as ${EMAIL} to see the partner nav:`);
  console.log('  Post a Job · Applicants · Profile');
}

// The demo students ship with empty education/professional/resume, which makes
// the Applicants detail panel look broken rather than empty-by-design. Fill in
// the ones who have actually applied so there's something to review.
const PROFILES = {
  'aarav@demo.menler.in': {
    phone: '+91 98450 11234',
    education: { degree: 'B.Tech, Computer Science', institution: 'VNR VJIET, Hyderabad', year: '2024' },
    professional: { title: 'AI Automation Intern', company: 'Nimbus Labs', experience: '8 months' },
  },
  'diya@demo.menler.in': {
    phone: '+91 99012 44821',
    education: { degree: 'B.Sc, Data Science', institution: 'Christ University, Bengaluru', year: '2023' },
    professional: { title: 'Junior Data Analyst', company: 'Foldstone Retail', experience: '1 year 4 months' },
  },
  'vihaan@demo.menler.in': {
    phone: '+91 90083 77510',
    education: { degree: 'MCA', institution: 'Osmania University', year: '2022' },
    professional: { title: 'Support Engineer', company: 'Trellis Systems', experience: '2 years' },
  },
  'ananya@demo.menler.in': {
    phone: '+91 97045 20938',
    education: { degree: 'B.Com (Hons)', institution: 'St. Francis College', year: '2025' },
    professional: { title: '', company: '', experience: 'Fresher' },
  },
};

/** Minimal one-page PDF, handwritten byte-for-byte so the seed needs no PDF
 *  library. Enough for the partner's inline preview to render something real. */
function resumePdf(name, lines) {
  const text = [`BT /F1 18 Tf 60 760 Td (${name}) Tj ET`]
    .concat(lines.map((l, i) => `BT /F1 11 Tf 60 ${724 - i * 20} Td (${l.replace(/[()\\]/g, '')}) Tj ET`))
    .join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function fillCandidateProfiles() {
  const base = (process.env.API_PUBLIC_URL || 'http://localhost:4100').replace(/\/+$/, '');
  const dir = 'uploads';
  fs.mkdirSync(dir, { recursive: true });
  let touched = 0;

  for (const [email, p] of Object.entries(PROFILES)) {
    const u = await User.findOne({ email, role: 'student' });
    if (!u) continue;
    // Never overwrite a profile a real user filled in themselves.
    if (!u.phone) u.phone = p.phone;
    if (!u.education?.degree) u.education = p.education;
    if (!u.professional?.title && p.professional.title) u.professional = p.professional;
    if (!u.resumeUrl) {
      const file = `demo-resume-${email.split('@')[0]}.pdf`;
      fs.writeFileSync(path.join(dir, file), resumePdf(u.fullName || email, [
        `Email: ${email}`,
        `Phone: ${p.phone}`,
        '',
        'EDUCATION',
        `${p.education.degree}`,
        `${p.education.institution} - ${p.education.year}`,
        '',
        'EXPERIENCE',
        p.professional.title ? `${p.professional.title}, ${p.professional.company}` : 'Fresher',
        p.professional.experience ? `Duration: ${p.professional.experience}` : '',
        '',
        'PROGRAM',
        'Menler Kickstarter - AI Foundations, Claude OS',
      ]));
      u.resumeUrl = `${base}/uploads/${file}`;
    }
    await u.save();
    touched += 1;
  }
  if (touched) console.log(`✓ Filled ${touched} candidate profile(s) + demo resumes`);
}

async function run() {
  await connectDb();
  if (process.argv.includes('--undo')) await undo();
  else await seed();
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
