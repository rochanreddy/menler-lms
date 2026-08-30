// Writes docs/TEST-ACCOUNTS.md from what is ACTUALLY in the database.
//   node scripts/dumpAccounts.mjs
//
// Generated rather than hand-written on purpose: a credentials sheet that is
// typed by hand goes stale the first time the seed changes, and a stale one is
// worse than none — you spend the afternoon debugging a login that was simply
// renamed. Re-run this after any seed change.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { Submission } from '../models/Submission.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Attendance } from '../models/Attendance.js';
import { Progress } from '../models/Progress.js';

const PASSWORD = process.env.LMS_SEED_TEST_PASSWORD || 'Test@1234';
const ADMIN_EMAIL = process.env.LMS_SEED_EMAIL || 'admin@menler.in';
const ADMIN_PASSWORD = process.env.LMS_SEED_PASSWORD || 'ChangeMe123!';

// This database also holds accounts that are NOT part of this fixture: leftovers
// from the older `seed:demo`, and whoever has actually signed up locally. Mixing
// them into the credentials sheet makes it actively misleading — you would try to
// log in as a stale demo mentor to test a refusal that no longer means anything.
// So the fixture is identified explicitly, and everything else is listed apart,
// without passwords we do not know and without commentary we cannot support.
const FIXTURE_MENTOR = /@menler\.in$/;
const FIXTURE_STUDENT = /@student\.menler\.in$/;
const FIXTURE_BATCH = /^(Kickstarter|Generalist) · /;
const isFixtureMentor = (u) => FIXTURE_MENTOR.test(u.email) && u.email !== 'mentor@menler.in';
const isFixtureStudent = (u) => FIXTURE_STUDENT.test(u.email);

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../docs/TEST-ACCOUNTS.md');

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

async function run() {
  await connectDb();

  const allBatches = await Batch.find().sort({ name: 1 });
  const batches = allBatches.filter((b) => FIXTURE_BATCH.test(b.name));
  const otherBatches = allBatches.filter((b) => !FIXTURE_BATCH.test(b.name));
  const programs = await Program.find();
  const progById = new Map(programs.map((p) => [String(p._id), p]));
  const batchById = new Map(allBatches.map((b) => [String(b._id), b]));
  const lessonsIn = (p) => (p?.modules || []).reduce((n, m) => n + m.chapters.reduce((c, ch) => c + ch.topics.length, 0), 0);

  const admins = await User.find({ role: 'admin' }).sort({ email: 1 });
  const allMentors = await User.find({ role: 'mentor' }).sort({ fullName: 1 });
  const allStudents = await User.find({ role: 'student' }).sort({ fullName: 1 });
  const mentors = allMentors.filter(isFixtureMentor);
  const students = allStudents.filter(isFixtureStudent);
  const strays = [...allMentors.filter((u) => !isFixtureMentor(u)), ...allStudents.filter((u) => !isFixtureStudent(u))];

  const L = [];
  L.push('# Test accounts');
  L.push('');
  L.push('> **Local test fixtures only.** These are seeded accounts on the dev database,');
  L.push('> not real credentials. Do not reuse this password anywhere real, and do not');
  L.push('> point this file at a production cluster.');
  L.push('');
  L.push(`_Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by \`node scripts/dumpAccounts.mjs\` — regenerate after any seed change._`);
  L.push('');
  L.push('## The password');
  L.push('');
  L.push('| Who | Password |');
  L.push('|---|---|');
  L.push(`| Every seeded mentor and student | \`${PASSWORD}\` |`);
  L.push(`| Admin (kept separate, set by \`npm run seed\`) | \`${ADMIN_PASSWORD}\` |`);
  L.push('');
  L.push('The **Name** column in the tables below is a display name, not a credential.');
  L.push('Every table repeats the password so a row can be read straight across without');
  L.push('scrolling back up here.');
  L.push('');
  L.push('## Where things run');
  L.push('');
  L.push('| | URL |');
  L.push('|---|---|');
  L.push('| App | http://localhost:5174 |');
  L.push('| API | http://localhost:4100/api/lms |');
  L.push('');
  L.push('```bash');
  L.push('cd server && npm run dev        # :4100');
  L.push('cd client && npm run dev        # :5174');
  L.push('cd server && npm run seed:full  # rebuild this whole world');
  L.push('cd server && npm run test:flows # 85 API assertions across all three roles');
  L.push('```');
  L.push('');

  // ── Admin ──
  L.push('## Admin');
  L.push('');
  L.push('| Email | Password | Name |');
  L.push('|---|---|---|');
  for (const a of admins) L.push(`| \`${a.email}\` | \`${a.email === ADMIN_EMAIL ? ADMIN_PASSWORD : PASSWORD}\` | ${a.fullName || '—'} |`);
  L.push('');

  // ── Batches ──
  L.push('## Batches (this fixture)');
  L.push('');
  L.push('| Batch | Programme | Lessons | Mentors | Students | Runs |');
  L.push('|---|---|---|---|---|---|');
  for (const b of batches) {
    const p = progById.get(String(b.programId));
    const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
    L.push(`| ${b.name} | ${p?.title || '—'} | ${lessonsIn(p)} | ${b.mentorIds.length} | ${b.studentIds.length} | ${fmt(b.startDate)} → ${fmt(b.endDate)} |`);
  }
  L.push('');

  // ── Mentors ──
  L.push('## Mentors (this fixture)');
  L.push('');
  L.push('Access is granted at two levels and they are not the same thing: programme-level');
  L.push('lets a mentor SEE the curriculum, batch-level lets them GRADE. Both are set here.');
  L.push('');
  L.push('| Email | Password | Name | Batches they teach |');
  L.push('|---|---|---|---|');
  for (const m of mentors) {
    const names = (m.batchIds || []).map((id) => batchById.get(String(id))?.name).filter(Boolean);
    L.push(`| \`${m.email}\` | \`${PASSWORD}\` | ${m.fullName} | ${names.length ? names.join(' · ') : '—'} |`);
  }
  L.push('');

  // ── Students ──
  L.push('## Students (this fixture)');
  L.push('');
  L.push('Every one of them has real history: submissions, at least one graded submission with');
  L.push('mentor feedback, quiz attempts, attendance and partial lesson progress.');
  L.push('');
  L.push('| Email | Password | Name | Batches | Progress | Subs (graded) | Quizzes | Attendance |');
  L.push('|---|---|---|---|---|---|---|---|');

  const notable = [];
  for (const s of students) {
    const subs = await Submission.find({ studentId: s._id, isDeleted: false });
    const graded = subs.filter((x) => x.status === 'graded').length;
    const quizzes = await QuizAttempt.countDocuments({ studentId: s._id });
    const attRows = await Attendance.find({ studentId: s._id });
    const present = attRows.filter((a) => a.status === 'present').length;
    const progs = await Progress.find({ studentId: s._id });

    const batchNames = (s.batchIds || []).map((id) => batchById.get(String(id))?.name?.split(' · ')[0]).filter(Boolean);
    const progStr = progs.map((pr) => {
      const p = progById.get(String(pr.programId));
      return `${p?.title?.slice(0, 4)} ${pct(pr.completedTopics.length, lessonsIn(p))}%`;
    }).join(' · ');

    L.push(`| \`${s.email}\` | \`${PASSWORD}\` | ${s.fullName} | ${batchNames.join(' + ') || '—'} | ${progStr || '—'} | ${subs.length} (${graded}) | ${quizzes} | ${present}/${attRows.length} |`);

    const maxPct = Math.max(0, ...progs.map((pr) => pct(pr.completedTopics.length, lessonsIn(progById.get(String(pr.programId))))));
    const attPct = pct(present, attRows.length);
    if (maxPct === 100) notable.push([s.email, 'at 100% — the certificate path']);
    else if (maxPct <= 20) notable.push([s.email, `only ${maxPct}% done, ${attPct}% attendance — the at-risk panel`]);
    if ((s.batchIds || []).length === 2) notable.push([s.email, 'enrolled in BOTH batches — merged lists, per-programme progress']);
  }
  L.push('');

  // ── Who to log in as for what ──
  L.push('## Who to log in as, for what');
  L.push('');
  L.push('| Email | Why this one |');
  L.push('|---|---|');
  const seen = new Set();
  for (const [email, why] of notable) {
    const k = `${email}|${why}`;
    if (seen.has(k)) continue;
    seen.add(k);
    L.push(`| \`${email}\` | ${why} |`);
  }
  const soloMentor = mentors.find((m) => (m.batchIds || []).length === 1);
  const dualMentor = mentors.find((m) => (m.batchIds || []).length === 2);
  if (dualMentor) L.push(`| \`${dualMentor.email}\` | teaches both programmes — batch switching, full grading queue |`);
  if (soloMentor) L.push(`| \`${soloMentor.email}\` | teaches ONE programme — use to check the other batch is genuinely refused |`);
  L.push('');
  if (strays.length || otherBatches.length) {
    L.push('## Other accounts in this database');
    L.push('');
    L.push('Not created by `seed:full` and **not covered by the password above** — left in');
    L.push('place because deleting accounts is not the job of this script. Ignore them');
    L.push('when cross-checking — they are older `seed:demo` fixtures and real local signups.');
    L.push('');
    if (otherBatches.length) {
      L.push(`Stale batches: ${otherBatches.map((b) => `\`${b.name}\``).join(', ')}`);
      L.push('');
    }
    L.push('| Email | Role | Note |');
    L.push('|---|---|---|');
    for (const u of strays) {
      const demo = /@demo\.menler\.in$/.test(u.email) || u.email === 'mentor@menler.in';
      L.push(`| \`${u.email}\` | ${u.role} | ${demo ? 'old `seed:demo` fixture' : 'real local account — left alone'} |`);
    }
    L.push('');
  }

  L.push('## Edge cases already in the data');
  L.push('');
  L.push('These are pinned by the seed, not random, so they are there on every run:');
  L.push('');
  L.push('- An assignment that has **not opened yet**, and one that is **overdue and never submitted**.');
  L.push('- Submissions sitting in **`NEEDS_FIXES`** and **`PENDING_CHECK`**, not just `READY`.');
  L.push('- **Graded and locked** submissions — the student cannot edit until a mentor unlocks.');
  L.push('- One student per batch who **never sat the exam**.');
  L.push('- Past sessions with **recordings**, one class **today**, and future ones with **no link yet**.');
  L.push('');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${L.join('\n')}\n`, 'utf8');
  console.log(`✓ wrote ${OUT}`);
  console.log(`  ${admins.length} admin · ${mentors.length} mentors · ${students.length} students · ${batches.length} batches`);

  await mongoose.disconnect();
}

run().catch((e) => { console.error('dumpAccounts failed:', e); process.exit(1); });
