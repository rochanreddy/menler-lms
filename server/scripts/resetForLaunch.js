// Reset the LMS to its launch state: the admin, the programmes' lesson trees,
// the real library, the batches you name — and nothing else. Every cohort
// artefact (sessions, attendance, assignments, submissions, quizzes, attempts,
// progress, announcements, doubts, chat, notifications, lesson videos, device
// sessions, playback leases, webinars, `[seed]` library items) is deleted,
// every non-admin account is deleted, and one fresh student is created in the
// batch you choose. Run from server/:
//
//   CONFIRM_DB=menler LMS_LAUNCH_STUDENT_PASSWORD='…' node scripts/resetForLaunch.js
//
// Knobs (env):
//   CONFIRM_DB                   must equal the database the URI resolves to —
//                                the script refuses to run otherwise, so a
//                                stale MONGODB_URI cannot point it at the
//                                wrong data.
//   LMS_LAUNCH_STUDENT_PASSWORD  required; the student's sign-in password.
//   LMS_LAUNCH_STUDENT_EMAIL     default team@menler.in
//   LMS_LAUNCH_STUDENT_NAME      default "Menler Team"
//   LMS_KEEP_BATCHES             comma-separated exact batch names to keep
//                                (default "Kickstarter · Sept 2026,Generalist · Sept 2026")
//   LMS_LAUNCH_STUDENT_BATCH     which kept batch the student is enrolled in
//                                (default "Generalist · Sept 2026")
//
// Before it deletes anything it writes every lms_* collection to
// server/backups/<db>-<timestamp>/<collection>.json as canonical Extended
// JSON, so ObjectIds and dates survive a restore. It never touches a
// collection outside the lms_* prefix: the cluster is shared with the
// marketing site.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { LibraryItem } from '../models/LibraryItem.js';
import { Webinar } from '../models/Webinar.js';
import { BatchLessonVideo } from '../models/BatchLessonVideo.js';
import { DeviceSession } from '../models/DeviceSession.js';
import { PlaybackLease } from '../models/PlaybackLease.js';
import { FileAsset } from '../models/FileAsset.js';
import { hashPassword } from '../utils/password.js';

const STUDENT_EMAIL = (process.env.LMS_LAUNCH_STUDENT_EMAIL || 'team@menler.in').toLowerCase().trim();
const STUDENT_NAME = process.env.LMS_LAUNCH_STUDENT_NAME || 'Menler Team';
const STUDENT_PASSWORD = process.env.LMS_LAUNCH_STUDENT_PASSWORD || '';
const KEEP_BATCHES = (process.env.LMS_KEEP_BATCHES || 'Kickstarter · Sept 2026,Generalist · Sept 2026')
  .split(',').map((s) => s.trim()).filter(Boolean);
const STUDENT_BATCH = process.env.LMS_LAUNCH_STUDENT_BATCH || 'Generalist · Sept 2026';

// Collections from retired features (the old partner/jobs board) that no model
// references any more. Dropped outright rather than emptied.
const RETIRED_COLLECTIONS = ['lms_jobs', 'lms_applications'];

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function backup(db) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backups', `${db.databaseName}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const { EJSON } = mongoose.mongo.BSON;
  const names = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => n.startsWith('lms_')).sort();
  let total = 0;
  for (const name of names) {
    const rows = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), EJSON.stringify(rows, { relaxed: false }));
    total += rows.length;
  }
  return { dir, collections: names.length, rows: total };
}

async function run() {
  if (!STUDENT_PASSWORD) fail('LMS_LAUNCH_STUDENT_PASSWORD is required.');
  if (!KEEP_BATCHES.includes(STUDENT_BATCH)) fail(`LMS_LAUNCH_STUDENT_BATCH "${STUDENT_BATCH}" is not in LMS_KEEP_BATCHES.`);

  await connectDb();
  const db = mongoose.connection.db;
  if (process.env.CONFIRM_DB !== db.databaseName) {
    fail(`Connected to "${db.databaseName}" but CONFIRM_DB is "${process.env.CONFIRM_DB || ''}". Set CONFIRM_DB=${db.databaseName} to proceed.`);
  }

  // ── Preconditions: never leave the LMS with no way in, and never guess a batch ──
  const admins = await User.find({ role: 'admin' }).select('_id email');
  if (admins.length === 0) fail('No admin account found — refusing to delete every other user.');
  const keep = await Batch.find({ name: { $in: KEEP_BATCHES } }).populate('programId', 'title');
  const missing = KEEP_BATCHES.filter((n) => !keep.some((b) => b.name === n));
  if (missing.length) fail(`Batch(es) not found by exact name: ${missing.map((m) => `"${m}"`).join(', ')}.`);
  const studentBatch = keep.find((b) => b.name === STUDENT_BATCH);

  console.log(`\n─────────── resetting "${db.databaseName}" to launch state ───────────\n`);

  // ── Backup first ──
  const b = await backup(db);
  console.log(`✓ backup          ${b.collections} collections · ${b.rows} rows → ${b.dir}`);

  // ── Everything cohort-scoped goes, kept batches included (they are meant to be fresh) ──
  const adminIds = admins.map((a) => a._id);
  const wipes = [
    ['sessions', Session.deleteMany({})],
    ['attendance', Attendance.deleteMany({})],
    ['assignments', Assignment.deleteMany({})],
    ['submissions', Submission.deleteMany({})],
    ['quizzes', Quiz.deleteMany({})],
    ['quiz attempts', QuizAttempt.deleteMany({})],
    ['progress', Progress.deleteMany({})],
    ['announcements', Announcement.deleteMany({})],
    ['doubts', Doubt.deleteMany({})],
    ['chat messages', Message.deleteMany({})],
    ['notifications', Notification.deleteMany({})],
    ['lesson videos', BatchLessonVideo.deleteMany({})],
    ['webinars', Webinar.deleteMany({})],
    ['[seed] library', LibraryItem.deleteMany({ title: /^\[seed\]/ })],
    ['playback leases', PlaybackLease.deleteMany({})],
    ['device sessions', DeviceSession.deleteMany({ userId: { $nin: adminIds } })],
    ['uploaded files', FileAsset.deleteMany({ ownerId: { $nin: adminIds } })],
  ];
  for (const [label, op] of wipes) {
    const r = await op;
    console.log(`✓ deleted         ${String(r.deletedCount).padStart(4)}  ${label}`);
  }

  // ── Batches: keep the named ones, empty of people; drop the rest ──
  const keepIds = keep.map((x) => x._id);
  const dropped = await Batch.find({ _id: { $nin: keepIds } }).select('name');
  await Batch.deleteMany({ _id: { $nin: keepIds } });
  await Batch.updateMany({ _id: { $in: keepIds } }, { $set: { mentorIds: [], studentIds: [] } });
  console.log(`✓ deleted         ${String(dropped.length).padStart(4)}  batches${dropped.length ? `: ${dropped.map((x) => `"${x.name}"`).join(', ')}` : ''}`);
  console.log(`✓ kept            ${String(keep.length).padStart(4)}  batches: ${keep.map((x) => `"${x.name}"`).join(', ')}`);

  // ── Programmes keep their lesson trees; no mentor teaches them yet ──
  await Program.updateMany({}, { $set: { mentorIds: [] } });

  // ── Users: everyone but the admins ──
  const gone = await User.find({ role: { $ne: 'admin' } }).select('email role');
  await User.deleteMany({ role: { $ne: 'admin' } });
  console.log(`✓ deleted         ${String(gone.length).padStart(4)}  users (${['mentor', 'student'].map((r) => `${gone.filter((u) => u.role === r).length} ${r}s`).join(', ')}, ${gone.filter((u) => !['mentor', 'student'].includes(u.role)).length} other)`);
  for (const u of gone) console.log(`                    - ${u.email} (${u.role})`);

  // ── Retired collections ──
  const present = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of RETIRED_COLLECTIONS) {
    if (present.includes(name)) {
      await db.dropCollection(name);
      console.log(`✓ dropped         ${name}`);
    }
  }

  // ── The one launch student, fresh: no progress, no sessions, no forced reset ──
  const student = await User.create({
    email: STUDENT_EMAIL,
    fullName: STUDENT_NAME,
    role: 'student',
    passwordHash: await hashPassword(STUDENT_PASSWORD),
    emailVerified: true,
    mustChangePassword: false,
    batchIds: [studentBatch._id],
    lastActiveAt: null,
  });
  await Batch.updateOne({ _id: studentBatch._id }, { $addToSet: { studentIds: student._id } });
  console.log(`✓ student         ${STUDENT_EMAIL} → "${studentBatch.name}" (${studentBatch.programId?.title})`);

  // ── Final state ──
  const [users, programs, batches] = await Promise.all([
    User.find().select('email role batchIds').sort({ role: 1 }),
    Program.find().select('title modules mentorIds'),
    Batch.find().select('name status studentIds mentorIds').populate('programId', 'title'),
  ]);
  const lessons = (p) => (p.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0);
  console.log('\n─────────── final state ───────────\n');
  for (const u of users) console.log(`  ${u.role.padEnd(8)} ${u.email.padEnd(32)} batches: ${u.batchIds.length}`);
  console.log('');
  for (const p of programs) console.log(`  programme ${p.title.padEnd(12)} ${lessons(p)} lessons · ${p.mentorIds.length} mentors`);
  console.log('');
  for (const x of batches) console.log(`  batch     ${x.name.padEnd(28)} ${x.programId?.title} · ${x.status} · ${x.mentorIds.length} mentors · ${x.studentIds.length} students`);
  console.log(`\nBackup: ${b.dir}\nDone.\n`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => { console.error('resetForLaunch failed:', err); process.exit(1); });
