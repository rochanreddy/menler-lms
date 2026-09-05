// A whole LMS, mid-cohort. Run:  npm run seed:full
//
// This builds the world the product is meant to be used in, not a smoke test:
// two programmes with real curriculum trees, two cohorts that started eight
// weeks ago and finish in six, four mentors with deliberately overlapping
// access, and sixteen students — some in one batch, some in both — each of whom
// has actually done things: watched lessons, missed classes, submitted late,
// been graded, failed a Drive check, sat quizzes, asked doubts.
//
// Two rules govern this script:
//
//   1. It NEVER deletes a User. Accounts are upserted by email so you can keep
//      testing the same logins across reruns. Everything else (batches and the
//      sessions/assignments/submissions/quizzes hanging off them) is torn down
//      and rebuilt, so the script is idempotent without being destructive.
//   2. Randomness is seeded, so two runs produce the same world. A bug you see
//      is a bug you can reproduce.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { Session } from '../models/Session.js';
import { Attendance } from '../models/Attendance.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Progress } from '../models/Progress.js';
import { Announcement } from '../models/Announcement.js';
import { Doubt } from '../models/Doubt.js';
import { LibraryItem } from '../models/LibraryItem.js';
import { Notification } from '../models/Notification.js';
import { hashPassword } from '../utils/password.js';
import {
  kickstarterModules,
  generalistModules,
  KICKSTARTER_DESCRIPTION,
  GENERALIST_DESCRIPTION,
} from './curricula.js';
import { loadCurriculumPdfUrls, applyModuleReadingPdfs } from '../utils/curriculumPdfAssets.js';
import { assertSeedTarget } from './seedGuard.js';

// ── Knobs ────────────────────────────────────────────────────────────────────
const PASSWORD = process.env.LMS_SEED_TEST_PASSWORD || 'Test@1234';
const ADMIN_EMAIL = process.env.LMS_SEED_EMAIL || 'admin@menler.in';
const ADMIN_PASSWORD = process.env.LMS_SEED_PASSWORD || 'ChangeMe123!';

// Fallback for modules without a week/session ebook yet (weeks 3–6, sessions 3–4).
const PDF = 'https://menler.in/pdfs/Menler_AI_Kickstarter_Curriculum.pdf';
const RECORDING = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const LIVE_ROOM = 'https://zoom.us/j/98765432101';
const DRIVE = (n) => `https://drive.google.com/drive/folders/1mEnLeRtEsT${String(n).padStart(4, '0')}`;

const DAY = 86400000;
const now = Date.now();
const at = (days, hour = 19, min = 0) => {
  const d = new Date(now + days * DAY);
  d.setHours(hour, min, 0, 0);
  return d;
};

// Mulberry32 — small, seeded, good enough for fixtures and fully deterministic.
let _s = 0x9e3779b9;
const rnd = () => {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const intBetween = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// ── People ───────────────────────────────────────────────────────────────────
const MENTORS = [
  { name: 'Rahul Verma', email: 'rahul.verma@menler.in', programs: ['Kickstarter', 'Generalist'] },
  { name: 'Priya Nambiar', email: 'priya.nambiar@menler.in', programs: ['Kickstarter', 'Generalist'] },
  { name: 'Imran Qureshi', email: 'imran.qureshi@menler.in', programs: ['Kickstarter', 'Generalist'] },
  { name: 'Sneha Kulkarni', email: 'sneha.kulkarni@menler.in', programs: ['Generalist'] },
];

// 6 Kickstarter-only + 6 Generalist-only + 4 in BOTH = 10 per batch, with four
// dual-enrolled students to exercise the multi-batch paths (batch switcher,
// merged assignment list, per-programme progress).
const STUDENTS = [
  { name: 'Aarav Sharma', in: ['K'] },
  { name: 'Diya Patel', in: ['K'] },
  { name: 'Vihaan Reddy', in: ['K'] },
  { name: 'Ananya Iyer', in: ['K'] },
  { name: 'Arjun Mehta', in: ['K'] },
  { name: 'Isha Nair', in: ['K'] },
  { name: 'Kabir Singh', in: ['G'] },
  { name: 'Sara Khan', in: ['G'] },
  { name: 'Rohan Desai', in: ['G'] },
  { name: 'Meera Joshi', in: ['G'] },
  { name: 'Aditya Rao', in: ['G'] },
  { name: 'Nisha Bhatt', in: ['G'] },
  { name: 'Kavya Menon', in: ['K', 'G'] },
  { name: 'Dev Malhotra', in: ['K', 'G'] },
  { name: 'Tanvi Shetty', in: ['K', 'G'] },
  { name: 'Yash Chauhan', in: ['K', 'G'] },
];
const emailFor = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@student.menler.in`;

// ── Curriculum ───────────────────────────────────────────────────────────────
// The real Kickstarter and Generalist trees, read from curricula.js — the same
// source seed:content authors from. This script must never carry lesson copy of
// its own: a fixture that invents a curriculum is how the placeholder lessons
// used to end up in front of students.
//
// What the fixture adds on top is the per-lesson media the lesson UI needs.
function withLessonMedia(modules, programTitle, urlByFile) {
  const withReading = applyModuleReadingPdfs(modules, programTitle, urlByFile);
  const lastLive = Math.min(2, withReading.length - 1);
  return withReading.map((m, mi) => ({
    ...m,
    chapters: m.chapters.map((ch) => ({
      ...ch,
      topics: ch.topics.map((t) => ({
        ...t,
        readingUrl: t.readingUrl || PDF,
        notesUrl: t.notesUrl || PDF,
        // Past lectures point at a recording, the current module at a live
        // room, later ones at nothing — the three-state case the lesson UI
        // handles.
        classLink: mi < lastLive ? RECORDING : (mi === lastLive ? LIVE_ROOM : ''),
      })),
    })),
  }));
}

// Module titles are prefixed with their code ("S01 · …", "WEEK 3 · …"). Session
// names want the human half, and the portfolio module has no prefix at all.
const moduleLabel = (title) => {
  const i = title.indexOf('·');
  return (i === -1 ? title : title.slice(i + 1)).trim();
};

// ── Assignments / quizzes per batch ──────────────────────────────────────────
// Dates are relative to today so the cohort is genuinely mid-flight: two closed,
// one open and overdue, one project running, one just opened, one not yet started.
const ASSIGNMENT_SPECS = [
  { key: 'a1', type: 'assignment', title: 'AI Audit, where does it already touch your work?', start: -52, due: -45, required: ['image', 'doc'] },
  { key: 'a2', type: 'assignment', title: 'Prompt rewrite battle', start: -38, due: -31, required: ['doc'] },
  { key: 'a3', type: 'assignment', title: 'Automate one weekly chore', start: -24, due: -3, required: ['video', 'image', 'doc'] },
  { key: 'p1', type: 'project', title: 'Portfolio project, the case study', start: -20, due: 9, required: ['video', 'image', 'doc'] },
  { key: 'a4', type: 'assignment', title: 'Peer review, read two case studies', start: -2, due: 12, required: ['doc'] },
  { key: 'p2', type: 'project', title: 'Capstone, ship it to a real user', start: 14, due: 34, required: ['video', 'doc', 'slides'] },
];

const QUIZ_SPECS = [
  { title: 'Checkpoint 1, foundations', type: 'quiz', qs: [
    ['A context window is…', ['How long the model has existed', 'How much text the model can consider at once', 'The model’s training cutoff', 'A rate limit'], 1, 'It is the working memory for a single request, everything the model can see at that moment.'],
    ['Hallucinations are best described as…', ['Deliberate lies', 'Confident output unsupported by fact', 'Encoding errors', 'A rate-limit symptom'], 1, 'The model optimises for plausible continuation, not truth, so wrongness arrives fluent.'],
    ['Which of these does an LLM NOT have by default?', ['A tokeniser', 'Weights', 'Live access to today’s news', 'A context window'], 2, 'Without a tool or retrieval step it only knows what it was trained on.'],
    ['Chain prompting mainly helps because…', ['It is cheaper', 'It splits a task into checkable steps', 'It avoids rate limits', 'It removes the need for context'], 1, 'Each step can be inspected before the next one compounds the error.'],
  ] },
  { title: 'Checkpoint 2, prompting', type: 'quiz', qs: [
    ['The C in CLEAR stands for…', ['Clarity', 'Context', 'Constraint', 'Correction'], 1, 'Context first, the model cannot infer what you never said.'],
    ['Role prompting is least useful when…', ['The task needs a voice', 'The task is factual retrieval', 'You want a specific tone', 'You need a persona'], 1, 'A persona does not make a fact true; it makes a wrong fact sound authoritative.'],
    ['A good constraint is…', ['"Be creative"', '"Under 120 words, three bullets"', '"Do your best"', '"Make it pop"'], 1, 'Countable constraints are the ones the model can satisfy and you can check.'],
  ] },
  { title: 'Mid-programme exam', type: 'exam', qs: [
    ['Before automating a process you should first…', ['Buy the tool', 'Map it manually end to end', 'Write the prompt', 'Schedule it'], 1, 'You cannot automate a process you cannot describe. Mapping surfaces the branches.'],
    ['A human checkpoint belongs where…', ['Nowhere, if the model is good', 'At every step', 'Where a wrong output is expensive or irreversible', 'Only at the start'], 2, 'Cost of being wrong is the only sensible criterion for spending human attention.'],
    ['Logging matters because…', ['It is required by law', 'It lets you debug a failure you did not witness', 'It speeds up the model', 'It reduces tokens'], 1, 'The failure happens at 3am on someone else’s input; the log is all you will have.'],
    ['The best portfolio project is one that…', ['Uses the most tools', 'Solves a problem you actually had', 'Has the longest write-up', 'Uses the newest model'], 1, 'A real problem gives you a real before-and-after, which is the whole case study.'],
    ['An honest chart axis…', ['Always starts at zero', 'Starts wherever makes the trend clearest', 'Starts at zero unless truncation is labelled', 'Has no gridlines'], 2, 'Truncation is sometimes right, but it must be visible to the reader.'],
  ] },
];

const FEEDBACK = {
  high: ['Genuinely strong, the walkthrough is clear and the reasoning holds.', 'Excellent. You showed the failure case as well as the happy path, which most people skip.', 'Very good work. The write-up would stand up in front of a client.'],
  mid: ['Solid submission. The idea is right; tighten the write-up and it lands.', 'Good, though the screenshots do not quite show the claim you are making.', 'Decent. Next time state the before-and-after explicitly.'],
  low: ['Incomplete, the deliverable is here but the reasoning is not shown.', 'This needs another pass. Read the brief again, particularly the deliverables list.', 'Thin. You have the tool working but have not explained what it changed.'],
};
const pickFeedback = (score) => pick(score >= 8 ? FEEDBACK.high : score >= 6 ? FEEDBACK.mid : FEEDBACK.low);

const FILES = {
  video: { name: 'walkthrough.mp4', type: 'video', mimeType: 'video/mp4' },
  image: { name: 'screenshot-01.png', type: 'image', mimeType: 'image/png' },
  doc: { name: 'case-study.pdf', type: 'doc', mimeType: 'application/pdf' },
  slides: { name: 'deck.pptx', type: 'doc', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
async function upsertUser({ email, fullName, role }) {
  const passwordHash = await hashPassword(PASSWORD);
  const existing = await User.findOne({ email });
  if (existing) {
    // Reset only what the fixture owns. Never touch the document's identity and
    // never delete it — these logins are meant to survive reruns.
    existing.fullName = fullName;
    existing.role = role;
    existing.passwordHash = passwordHash;
    existing.emailVerified = true;
    existing.mustChangePassword = false;
    existing.batchIds = [];
    existing.blocked = { lms: false, batchIds: [], moduleIds: [], assignmentIds: [], reason: '', at: null };
    await existing.save();
    return existing;
  }
  return User.create({
    email, fullName, role, passwordHash,
    emailVerified: true, mustChangePassword: false,
    lastActiveAt: new Date(now - intBetween(0, 6) * DAY),
  });
}

async function upsertProgram(title, buildModules, description, pdfUrls) {
  let p = await Program.findOne({ title });
  if (!p) p = new Program({ title });
  p.type = 'cohort';
  p.slug = title.toLowerCase();
  p.published = true;

  // NEVER clobber an authored curriculum. This used to assign p.modules
  // unconditionally, which silently replaced the real Kickstarter tree (seeded
  // by seed:content) with placeholder lessons. A fixture may fill an empty
  // programme; it may not overwrite content someone has edited since. Pass
  // FORCE_CURRICULUM=1 to reset a programme back to the PDF curriculum.
  const existing = (p.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((c, ch) => c + (ch.topics || []).length, 0), 0);
  if (existing === 0 || process.env.FORCE_CURRICULUM === '1') {
    p.modules = withLessonMedia(buildModules(), title, pdfUrls);
    p.description = description;
    await p.save();
    return { doc: p, authored: false };
  }
  await p.save();
  return { doc: p, authored: true };
}

const topicIdsOf = (program) =>
  program.modules.flatMap((m) => m.chapters.flatMap((c) => c.topics.map((t) => t._id.toString())));

async function run() {
  await connectDb();
  assertSeedTarget('seed:full', 'It invents sixteen students and four mentors, and deletes and rebuilds every "Kickstarter · …" and "Generalist · …" batch along with its sessions, assignments and submissions.');
  console.log('\n─────────── seeding a full LMS, mid-cohort ───────────\n');

  // ── Admin ──
  let admin = await User.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    admin = await User.create({
      email: ADMIN_EMAIL, fullName: 'Menler Admin', role: 'admin', emailVerified: true,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
    });
    console.log(`✓ admin created   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log(`• admin exists    ${ADMIN_EMAIL} (password left alone)`);
  }

  // ── Programmes ──
  const pdfUrls = await loadCurriculumPdfUrls(admin._id);
  const kickR = await upsertProgram('Kickstarter', kickstarterModules, KICKSTARTER_DESCRIPTION, pdfUrls);
  const genR = await upsertProgram('Generalist', generalistModules, GENERALIST_DESCRIPTION, pdfUrls);
  const kick = kickR.doc;
  const gen = genR.doc;
  const progByTag = { K: kick, G: gen };
  const note = (r) => (r.authored ? 'authored, left untouched' : 'from the PDF curriculum');
  console.log(`✓ programmes      Kickstarter ${topicIdsOf(kick).length} lessons (${note(kickR)}) · Generalist ${topicIdsOf(gen).length} lessons (${note(genR)})`);

  // ── Mentors ──
  const mentors = [];
  for (const m of MENTORS) {
    const u = await upsertUser({ email: m.email, fullName: m.name, role: 'mentor' });
    mentors.push({ ...m, doc: u });
  }
  const mentorsOf = (tag) => mentors.filter((m) => m.programs.includes(tag === 'K' ? 'Kickstarter' : 'Generalist'));

  // Programme-level assignment grants curriculum visibility; batch-level (below)
  // grants management. access.js keeps these deliberately separate, so both are
  // set here — a mentor who can see lessons but cannot grade is a real state,
  // just not the one you want by default.
  kick.mentorIds = mentorsOf('K').map((m) => m.doc._id);
  gen.mentorIds = mentorsOf('G').map((m) => m.doc._id);
  await kick.save();
  await gen.save();

  // ── Students ──
  const students = [];
  for (const s of STUDENTS) {
    const u = await upsertUser({ email: emailFor(s.name), fullName: s.name, role: 'student' });
    students.push({ ...s, doc: u });
  }
  console.log(`✓ people          ${mentors.length} mentors · ${students.length} students (no user was deleted)`);

  // ── Tear down the previous run's batch-scoped content (never users) ──
  const oldBatches = await Batch.find({ name: /^(Kickstarter|Generalist) · / }).select('_id');
  const oldIds = oldBatches.map((b) => b._id);
  if (oldIds.length) {
    const oldSessions = await Session.find({ batchId: { $in: oldIds } }).select('_id');
    const oldAssignments = await Assignment.find({ batchId: { $in: oldIds } }).select('_id');
    const oldQuizzes = await Quiz.find({ batchId: { $in: oldIds } }).select('_id');
    await Attendance.deleteMany({ sessionId: { $in: oldSessions.map((x) => x._id) } });
    await Submission.deleteMany({ assignmentId: { $in: oldAssignments.map((x) => x._id) } });
    await QuizAttempt.deleteMany({ quizId: { $in: oldQuizzes.map((x) => x._id) } });
    await Assignment.deleteMany({ _id: { $in: oldAssignments.map((x) => x._id) } });
    await Quiz.deleteMany({ _id: { $in: oldQuizzes.map((x) => x._id) } });
    await Session.deleteMany({ batchId: { $in: oldIds } });
    await Announcement.deleteMany({ batchId: { $in: oldIds } });
    await Doubt.deleteMany({ batchId: { $in: oldIds } });
    await Batch.deleteMany({ _id: { $in: oldIds } });
    console.log(`• cleared         ${oldIds.length} previous batch(es) and their content`);
  }
  await Progress.deleteMany({ studentId: { $in: students.map((s) => s.doc._id) } });
  await Notification.deleteMany({ userId: { $in: [...students, ...mentors].map((s) => s.doc._id) } });

  // ── Batches: eight weeks in, six to go ──
  const batches = {};
  for (const [tag, label] of [['K', 'Kickstarter · Jul 2026'], ['G', 'Generalist · Jul 2026']]) {
    const enrolled = students.filter((s) => s.in.includes(tag));
    const b = await Batch.create({
      programId: progByTag[tag]._id,
      name: label,
      startDate: at(-56, 10),
      endDate: at(42, 18),
      status: 'ongoing',
      mentorIds: mentorsOf(tag).map((m) => m.doc._id),
      studentIds: enrolled.map((s) => s.doc._id),
    });
    batches[tag] = { doc: b, tag, students: enrolled, mentors: mentorsOf(tag), program: progByTag[tag] };
    console.log(`✓ batch           ${label}, ${mentorsOf(tag).length} mentors · ${enrolled.length} students`);
  }

  // Mirror enrolment onto the user documents (both sides get read in places).
  for (const s of students) {
    s.doc.batchIds = s.in.map((t) => batches[t].doc._id);
    await s.doc.save();
  }
  for (const m of mentors) {
    m.doc.batchIds = Object.values(batches)
      .filter((b) => b.mentors.some((x) => x.email === m.email))
      .map((b) => b.doc._id);
    await m.doc.save();
  }

  const counts = { sessions: 0, attendance: 0, assignments: 0, submissions: 0, graded: 0, quizzes: 0, attempts: 0, doubts: 0, notifs: 0 };

  for (const B of Object.values(batches)) {
    const { doc: batch, students: cohort, mentors: staff, program } = B;
    const lead = staff[0].doc;

    // ── Sessions: nine done, one live today, three to come ──
    const sessions = [];
    for (let i = 0; i < 13; i++) {
      const offset = -56 + i * 7; // weekly, landing one exactly on today
      const isPast = offset < 0;
      const s = await Session.create({
        batchId: batch._id,
        // 13 weekly sessions spread evenly over the programme's modules, so
        // this holds for a 5-module Kickstarter and a 6-week Generalist alike.
        title: `Week ${i + 1}: ${moduleLabel(program.modules[Math.min(Math.floor((i * program.modules.length) / 13), program.modules.length - 1)].title)}`,
        startsAt: at(offset, 19),
        endsAt: at(offset, 20, 30),
        joinUrl: 'https://zoom.us/j/98765432101?pwd=seeded',
        zoomMeetingId: `9876543210${i}`,
        recordingUrl: isPast ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : '',
      });
      sessions.push({ doc: s, past: isPast });
      counts.sessions++;
    }

    // ── Attendance on every past session, for every student ──
    // Attendance is a per-student trait rather than a coin flip, so the at-risk
    // panel has genuinely distinguishable students to surface.
    const attendanceRate = new Map(cohort.map((s, i) => [String(s.doc._id), i === 0 ? 0.35 : i === 1 ? 0.55 : 0.7 + rnd() * 0.3]));
    const rows = [];
    for (const s of sessions.filter((x) => x.past)) {
      for (const st of cohort) {
        rows.push({
          sessionId: s.doc._id,
          batchId: batch._id,
          studentId: st.doc._id,
          status: chance(attendanceRate.get(String(st.doc._id))) ? 'present' : 'absent',
        });
      }
    }
    if (rows.length) {
      await Attendance.insertMany(rows);
      counts.attendance += rows.length;
    }

    // ── Assignments & projects ──
    const assignments = [];
    for (const spec of ASSIGNMENT_SPECS) {
      const a = await Assignment.create({
        batchId: batch._id,
        type: spec.type,
        title: spec.title,
        description: `**Brief.** ${spec.title}.\n\nSubmit a Google Drive folder shared as *Anyone with the link can view*. It must contain ${spec.required.join(', ')}.\n\n- State the problem in one sentence.\n- Show the before and the after.\n- Keep the write-up under a page.`,
        startDate: at(spec.start, 10),
        dueDate: at(spec.due, 23, 59),
        requiredDriveTypes: spec.required,
      });
      assignments.push({ doc: a, spec });
      counts.assignments++;
    }

    // ── Submissions: every student, every open assignment, varied states ──
    // Each student gets a "calibre" that drives score and reliability, so a
    // mentor's grading queue looks like a real class rather than noise.
    for (let si = 0; si < cohort.length; si++) {
      const st = cohort[si];
      const calibre = si % 5 === 0 ? 'low' : si % 3 === 0 ? 'mid' : 'high';

      for (const { doc: a, spec } of assignments) {
        if (spec.start > 0) continue; // not open yet — nothing to submit
        // The struggling student misses the two hardest ones outright, which is
        // what makes "overdue, never submitted" reachable in the student UI.
        if (calibre === 'low' && (spec.key === 'a3' || spec.key === 'p1')) continue;
        if (spec.key === 'a4' && chance(0.45)) continue; // the just-opened one is patchy

        const closed = spec.due < 0;
        // A distinct link per file: a real Drive folder never returns the same
        // webViewLink twice, and seeding it that way hid a key collision.
        const files = spec.required.map((t, fi) => ({ ...FILES[t], webViewLink: `${DRIVE(counts.submissions)}/${fi}-${FILES[t].name}` }));

        // Verification state. Closed assignments have all settled; the newest
        // ones are still in flight, which is the case the check panel exists for.
        let checkStatus = 'READY';
        let errorDetail = null;
        let outFiles = files;
        if (!closed && chance(0.18)) {
          checkStatus = 'NEEDS_FIXES';
          errorDetail = `The folder is missing ${pick(spec.required)}. Add it and re-submit, the check runs again automatically.`;
          outFiles = files.slice(0, 1);
        } else if (!closed && chance(0.12)) {
          checkStatus = 'PENDING_CHECK';
          outFiles = [];
        }

        // Grading. Everything closed is graded; the open project is only partly
        // done, so the mentor's queue is not empty.
        const gradeIt = closed || (spec.key === 'p1' && chance(0.5));
        const score = calibre === 'high' ? intBetween(8, 10) : calibre === 'mid' ? intBetween(6, 8) : intBetween(3, 6);

        await Submission.create({
          assignmentId: a._id,
          studentId: st.doc._id,
          driveLink: DRIVE(counts.submissions),
          url: DRIVE(counts.submissions),
          checkStatus,
          errorDetail,
          files: outFiles,
          checkedAt: new Date(now - intBetween(1, 20) * DAY),
          ...(gradeIt && checkStatus === 'READY'
            ? { status: 'graded', score, feedback: pickFeedback(score), locked: true }
            : { status: 'submitted', score: null, feedback: '' }),
        });
        counts.submissions++;
        if (gradeIt && checkStatus === 'READY') counts.graded++;
      }
    }

    // ── Quizzes, and an attempt from nearly everybody ──
    for (const qs of QUIZ_SPECS) {
      const quiz = await Quiz.create({
        batchId: batch._id,
        title: qs.title,
        type: qs.type,
        questions: qs.qs.map(([text, options, correctIndex, explanation]) => ({ text, options, correctIndex, explanation })),
      });
      counts.quizzes++;

      for (let si = 0; si < cohort.length; si++) {
        const st = cohort[si];
        // One student per batch leaves the exam untouched — "not attempted" has
        // its own UI and needs to be reachable.
        if (qs.type === 'exam' && si === 0) continue;
        const calibre = si % 5 === 0 ? 0.45 : si % 3 === 0 ? 0.7 : 0.9;
        const answers = quiz.questions.map((q) => (chance(calibre)
          ? q.correctIndex
          : (q.correctIndex + 1 + Math.floor(rnd() * (q.options.length - 1))) % q.options.length));
        const score = answers.reduce((n, ans, i) => n + (ans === quiz.questions[i].correctIndex ? 1 : 0), 0);
        await QuizAttempt.create({ quizId: quiz._id, studentId: st.doc._id, answers, score, total: quiz.questions.length });
        counts.attempts++;
      }
    }

    // ── Announcements ──
    await Announcement.create([
      { batchId: batch._id, authorId: lead._id, title: 'Week 9 reading is up', body: 'The handout and my teacher notes are attached to every lesson in this module. Read before Thursday.' },
      { batchId: batch._id, authorId: staff[Math.min(1, staff.length - 1)].doc._id, title: 'Portfolio project, office hours', body: 'I am holding an extra hour on Saturday for anyone stuck on scoping. Bring the problem, not the solution.' },
      { batchId: batch._id, authorId: lead._id, title: 'Grades released for the automation task', body: 'Feedback is on your submission. If you want it unlocked to revise, ask me directly.' },
    ]);

    // ── Doubts, with likes and mentor answers ──
    const questions = [
      'My Drive check keeps saying the folder is missing a doc, but the PDF is right there. What am I doing wrong?',
      'For the capstone, does a real user have to be someone outside the cohort?',
      'How long should the walkthrough video be? The brief says two minutes but mine is four.',
      'Is it fine to use a different model for the write-up as long as I say so?',
      'I missed week 6, is the recording enough or should I catch up differently?',
    ];
    const answers = [
      'Nine times out of ten this is the sharing setting, not the file. Open the link in a private window, if you cannot see it, neither can we.',
      'Yes, outside the cohort. The point is that someone with no context can use it.',
      'Two minutes is the target, not a rule. Four is fine if none of it is filler.',
      'Completely fine, as long as you say which model did what.',
      'Watch the recording, then bring one question to office hours. That is the catch-up.',
    ];
    for (let i = 0; i < questions.length; i++) {
      const asker = cohort[i % cohort.length];
      const likers = cohort.filter(() => chance(0.35)).map((s) => s.doc._id);
      const answerer = staff[i % staff.length].doc;
      await Doubt.create({
        batchId: batch._id,
        authorId: asker.doc._id,
        text: questions[i],
        likes: likers,
        comments: [
          { authorId: answerer._id, text: answers[i] },
          ...(chance(0.5)
            ? [{ authorId: cohort[(i + 1) % cohort.length].doc._id, text: pick(['Had the same problem, it was the sharing setting for me too.', 'Thanks, that clears it up.', 'Following, I was about to ask this.']) }]
            : []),
        ],
      });
      counts.doubts++;
    }

    // ── Progress: mid-cohort, so roughly the first half is done ──
    const topicIds = topicIdsOf(program);
    for (let si = 0; si < cohort.length; si++) {
      const st = cohort[si];
      // The median student sits a bit past halfway. Two per batch are pinned to
      // the extremes so the at-risk panel and the certificate path are both
      // reachable without hand-editing the database.
      const frac = si === 0 ? 0.18 : si === 1 ? 0.34 : (si === cohort.length - 1 ? 1 : 0.45 + rnd() * 0.35);
      const take = Math.max(1, Math.round(topicIds.length * frac));
      await Progress.create({
        studentId: st.doc._id,
        programId: program._id,
        completedTopics: topicIds.slice(0, take),
        certificateIssuedAt: frac === 1 ? new Date(now - 2 * DAY) : null,
      });
    }

    // ── A few unread notifications, so the bell is not empty ──
    const notifs = cohort.flatMap((s) => ([
      { userId: s.doc._id, type: 'grade', text: 'Your automation task has been graded.', link: '/app/grades', read: false },
      { userId: s.doc._id, type: 'announcement', text: 'Week 9 reading is up', link: '/app', read: chance(0.5) },
    ]));
    notifs.push(...staff.map((m) => ({ userId: m.doc._id, type: 'assignment', text: `${cohort.length} submissions are waiting on ${batch.name}.`, link: '/app/programs', read: false })));
    await Notification.insertMany(notifs);
    counts.notifs += notifs.length;
  }

  // ── Library (global) ──
  await LibraryItem.deleteMany({ title: /^\[seed\]/ });
  await LibraryItem.create([
    { title: '[seed] AI Kickstarter, full curriculum', category: 'Note', url: PDF, description: 'The complete lesson plan, all four sessions.' },
    { title: '[seed] Prompt cheat sheet', category: 'Note', url: PDF, description: 'CLEAR framework with worked examples.' },
    { title: '[seed] Session one deck', category: 'PPT', url: PDF, description: 'Slides as taught in week one.' },
    { title: '[seed] AI Generalist, fellowship curriculum', category: 'eBook', url: PDF, description: 'The six-week Claude-First fellowship, week by week.' },
    { title: '[seed] Case study template', category: 'Library', url: PDF, description: 'The structure we expect for the portfolio project.' },
  ]);

  // ── Summary ──
  console.log(`✓ sessions        ${counts.sessions}  (9 past · 1 today · 3 upcoming, per batch)`);
  console.log(`✓ attendance      ${counts.attendance} rows`);
  console.log(`✓ assignments     ${counts.assignments}  (4 assignments + 2 projects per batch)`);
  console.log(`✓ submissions     ${counts.submissions}  of which ${counts.graded} graded & locked`);
  console.log(`✓ quizzes         ${counts.quizzes}  · ${counts.attempts} attempts`);
  console.log(`✓ doubts          ${counts.doubts} threads with likes and mentor answers`);
  console.log(`✓ notifications   ${counts.notifs}`);
  console.log('✓ library         5 items');

  console.log('\n─────────── logins (all seeded accounts share one password) ───────────\n');
  console.log(`  password:  ${PASSWORD}\n`);
  console.log(`  admin    ${ADMIN_EMAIL}  (password unchanged: ${ADMIN_PASSWORD})`);
  for (const m of mentors) console.log(`  mentor   ${m.email.padEnd(34)} ${m.programs.join(' + ')}`);
  console.log('');
  for (const s of students) console.log(`  student  ${emailFor(s.name).padEnd(34)} ${s.in.map((t) => (t === 'K' ? 'Kickstarter' : 'Generalist')).join(' + ')}`);
  console.log('\nDone.\n');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => { console.error('seed:full failed:', err); process.exit(1); });
