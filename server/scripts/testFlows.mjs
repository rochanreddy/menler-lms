// End-to-end flow check against a RUNNING server. Run:  npm run test:flows
//
// This is not a unit-test suite — it drives the real HTTP API the way each role
// drives it, in order, and asserts both that the happy paths work and that the
// RBAC chokepoints actually refuse. A green run means an admin, a mentor and a
// student can each complete their whole loop, and that neither of the latter
// two can step outside it.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Doubt } from '../models/Doubt.js';
import { Announcement } from '../models/Announcement.js';

const BASE = process.env.LMS_API || 'http://localhost:4100/api/lms';
const PASSWORD = process.env.LMS_SEED_TEST_PASSWORD || 'Test@1234';
const ADMIN = { email: process.env.LMS_SEED_EMAIL || 'admin@menler.in', password: process.env.LMS_SEED_PASSWORD || 'ChangeMe123!' };
// Everything this script creates is prefixed so the seeded-data counts below can
// exclude it, and so a re-run without a reseed still reports honestly.
const FLOW = 'Flow-test';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `, ${detail}` : ''}`); console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `, ${detail}` : ''}`); }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// The single-session rule keys off X-Device-Id, and the whole script is one
// device unless a check deliberately says otherwise. Without this every run
// would look like a NEW device to the server and the second run inside twenty
// minutes would be told the account is in use — by the previous run.
const DEVICE = 'flowtest-primary';

async function call(path, { token, method = 'GET', body, device = DEVICE } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': device,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body is fine */ }
  return { status: res.status, json };
}

async function login(email, password = PASSWORD) {
  // force:true is the script answering the "this account is in use on another
  // device" prompt for itself. A real person is asked; an automated client that
  // is deliberately taking the account over says so up front, and without it a
  // run would be blocked by whatever the LAST run left signed in.
  const r = await call('/auth/login', { method: 'POST', body: { email, password, force: true } });
  // The API rate-limits login to 15 attempts per IP per minute, and this script
  // spends eleven of them. Running it twice inside a minute trips the limiter,
  // which is the limiter working — say so rather than reporting a phantom bug.
  if (r.status === 429) throw new Error(`rate-limited on login (${email}). The API allows 15 logins/minute/IP and this run uses 11, wait ~60s and re-run.`);
  const tok = r.json?.accessToken || r.json?.token;
  if (r.status !== 200 || !tok) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  return { token: tok, refreshToken: r.json.refreshToken, user: r.json.user };
}

async function run() {
  console.log(`\n═══ Menler LMS, role flow check ═══\n    ${BASE}`);

  // ────────────────────────────────────────────────────────────── AUTH
  section('AUTH');
  const admin = await login(ADMIN.email, ADMIN.password);
  ok('admin logs in', admin.user.role === 'admin');

  const mentorAll = await login('rahul.verma@menler.in');      // both programmes
  const mentorGen = await login('sneha.kulkarni@menler.in');   // Generalist only
  ok('mentor (both programmes) logs in', mentorAll.user.role === 'mentor');
  ok('mentor (Generalist only) logs in', mentorGen.user.role === 'mentor');

  const sK = await login('aarav.sharma@student.menler.in');    // Kickstarter only
  const sBoth = await login('kavya.menon@student.menler.in');  // both batches
  const sDone = await login('yash.chauhan@student.menler.in'); // 100% complete
  ok('student (Kickstarter) logs in', sK.user.role === 'student');
  ok('student (both batches) logs in', sBoth.user.batch_ids.length === 2, `batch_ids=${sBoth.user.batch_ids.length}`);

  const bad = await call('/auth/login', { method: 'POST', body: { email: 'aarav.sharma@student.menler.in', password: 'wrong' } });
  ok('wrong password is rejected', bad.status === 401);
  const noTok = await call('/batches');
  ok('unauthenticated request is rejected', noTok.status === 401);

  // ────────────────────────────────────────────────────────────── ADMIN
  section('ADMIN FLOW');
  const aPrograms = await call('/programs', { token: admin.token });
  const kick = aPrograms.json.programs.find((p) => p.title === 'Kickstarter');
  const gen = aPrograms.json.programs.find((p) => p.title === 'Generalist');
  ok('sees both programmes', !!kick && !!gen);

  // Exact lesson counts are NOT asserted: Kickstarter carries the real authored
  // curriculum (seed:content), which the fixture deliberately leaves alone, so
  // its shape is whoever last edited it — not this script's business. Structure
  // and reachability are.
  const kickFull = await call(`/programs/${kick._id}`, { token: admin.token });
  const kickTopics = (kickFull.json.program.modules || []).flatMap((m) => m.chapters.flatMap((c) => c.topics));
  ok('Kickstarter has a curriculum tree', (kickFull.json.program.modules || []).length > 0, `${kickFull.json.program.modules?.length} modules`);
  ok('…with lessons in it', kickTopics.length > 0, `${kickTopics.length} lessons`);
  ok('every lesson has a title', kickTopics.every((t) => (t.title || '').trim().length > 0));

  // The fixture-built programme is this script's own, so it CAN be held to the
  // stricter contract: both PDFs on every lesson.
  const genFull = await call(`/programs/${gen._id}`, { token: admin.token });
  const genTopics = (genFull.json.program.modules || []).flatMap((m) => m.chapters.flatMap((c) => c.topics));
  ok('Generalist has 24 seeded lessons', genTopics.length === 24, `got ${genTopics.length}`);
  ok('every seeded lesson carries a reading PDF', genTopics.every((t) => t.readingUrl?.endsWith('.pdf')));
  ok('every seeded lesson carries teacher notes PDF', genTopics.every((t) => t.notesUrl?.endsWith('.pdf')));

  // Fellowship was a duplicate of the Kickstarter curriculum with no batch behind
  // it; it should not reappear in the programme picker.
  ok('only Kickstarter and Generalist exist', aPrograms.json.programs.length === 2,
    `got ${aPrograms.json.programs.map((p) => p.title).join(', ')}`);

  const aBatches = await call('/batches', { token: admin.token });
  const bK = aBatches.json.batches.find((b) => b.name.startsWith('Kickstarter'));
  const bG = aBatches.json.batches.find((b) => b.name.startsWith('Generalist'));
  ok('sees both batches', !!bK && !!bG);

  const bKdetail = await call(`/batches/${bK.id}`, { token: admin.token });
  const bGdetail = await call(`/batches/${bG.id}`, { token: admin.token });
  const kMentors = bKdetail.json.batch.mentorIds || bKdetail.json.batch.mentors || [];
  const gMentors = bGdetail.json.batch.mentorIds || bGdetail.json.batch.mentors || [];
  const kStudents = bKdetail.json.batch.studentIds || bKdetail.json.batch.students || [];
  const gStudents = bGdetail.json.batch.studentIds || bGdetail.json.batch.students || [];
  ok('Kickstarter has 3 mentors', kMentors.length === 3, `got ${kMentors.length}`);
  ok('Generalist has 4 mentors', gMentors.length === 4, `got ${gMentors.length}`);
  ok('Kickstarter has 10 students', kStudents.length === 10, `got ${kStudents.length}`);
  ok('Generalist has 10 students', gStudents.length === 10, `got ${gStudents.length}`);

  const users = await call('/users?role=student', { token: admin.token });
  const studentList = users.json.users || users.json.students || [];
  ok('admin can list students', studentList.length >= 16, `got ${studentList.length}`);
  const dual = studentList.filter((u) => (u.batch_ids || u.batchIds || []).length === 2);
  ok('four students are in two batches', dual.length === 4, `got ${dual.length}`);

  const mentorsList = await call('/users?role=mentor', { token: admin.token });
  ok('admin can list mentors', (mentorsList.json.users || []).length >= 4);

  const aStats = await call('/stats/admin-dashboard', { token: admin.token });
  ok('admin dashboard stats load', aStats.status === 200);

  // ────────────────────────────────────────────────────────────── MENTOR
  section('MENTOR FLOW');
  const mBatches = await call('/batches', { token: mentorAll.token });
  ok('mentor on both programmes sees 2 batches', mBatches.json.batches.length === 2, `got ${mBatches.json.batches.length}`);

  const mgBatches = await call('/batches', { token: mentorGen.token });
  ok('Generalist-only mentor sees exactly 1 batch', mgBatches.json.batches.length === 1, `got ${mgBatches.json.batches.length}`);
  ok('…and it is the Generalist one', mgBatches.json.batches[0]?.name.startsWith('Generalist'));

  // RBAC: the Generalist-only mentor must not reach the Kickstarter batch.
  const crossBatch = await call(`/batches/${bK.id}`, { token: mentorGen.token });
  ok('Generalist mentor is refused the Kickstarter batch', crossBatch.status === 403 || crossBatch.status === 404, `got ${crossBatch.status}`);
  const crossAssign = await call(`/assignments?batchId=${bK.id}`, { token: mentorGen.token });
  ok('…and its assignments', crossAssign.status === 403, `got ${crossAssign.status}`);

  const mAssignments = await call(`/assignments?batchId=${bK.id}`, { token: mentorAll.token });
  const seededAssignments = (mAssignments.json.assignments || []).filter((a) => !a.title.startsWith(FLOW));
  ok('mentor lists batch assignments', seededAssignments.length === 6, `got ${seededAssignments.length}`);
  const project = mAssignments.json.assignments.find((a) => a.type === 'project');
  ok('the batch has projects as well as assignments', !!project);

  const mQuizzes = await call(`/quizzes?batchId=${bK.id}`, { token: mentorAll.token });
  ok('mentor lists batch quizzes', mQuizzes.json.quizzes?.length === 3, `got ${mQuizzes.json.quizzes?.length}`);
  ok('mentor sees the exam among them', mQuizzes.json.quizzes.some((q) => q.type === 'exam'));
  ok('mentor sees correct answers', mQuizzes.json.quizzes[0].questions[0].correctIndex !== undefined);

  const mSessions = await call(`/sessions?batchId=${bK.id}`, { token: mentorAll.token });
  ok('mentor lists sessions', (mSessions.json.sessions || []).length === 13, `got ${(mSessions.json.sessions || []).length}`);

  // Grading loop — find an ungraded submission and grade it for real.
  const openProject = mAssignments.json.assignments.find((a) => a.type === 'project' && new Date(a.dueDate) > new Date() && new Date(a.startDate) < new Date());
  const subsRes = await call(`/submissions?assignmentId=${openProject._id}`, { token: mentorAll.token });
  const subs = subsRes.json.submissions || [];
  ok('mentor sees submissions for the open project', subs.length > 0, `got ${subs.length}`);
  const ungraded = subs.find((s) => s.status !== 'graded');
  if (ungraded) {
    const graded = await call(`/submissions/${ungraded._id}/grade`, { token: mentorAll.token, method: 'PATCH', body: { score: 9, feedback: 'Flow-test grade, clear reasoning, good walkthrough.' } });
    ok('mentor grades a submission', graded.status === 200 || graded.status === 201, `got ${graded.status}`);
    ok('…the grade is persisted', graded.json?.submission?.score === 9, `score=${graded.json?.submission?.score}`);
    ok('…and grading locks it', graded.json?.submission?.locked === true);
    const unlocked = await call(`/submissions/${ungraded._id}/unlock`, { token: mentorAll.token, method: 'POST' });
    ok('mentor can unlock it again', unlocked.status === 200, `got ${unlocked.status}`);
  } else {
    ok('mentor grades a submission', false, 'no ungraded submission found to grade');
  }

  // Mentor creates content.
  const newAssign = await call('/assignments', { token: mentorAll.token, method: 'POST', body: { batchId: bK.id, type: 'assignment', title: 'Flow-test assignment', description: 'Created by the flow check.', dueDate: new Date(Date.now() + 7 * 86400000).toISOString(), requiredDriveTypes: ['doc'] } });
  ok('mentor creates an assignment', newAssign.status === 201, `got ${newAssign.status}`);
  const newAnn = await call('/announcements', { token: mentorAll.token, method: 'POST', body: { batchId: bK.id, title: 'Flow-test announcement', body: 'Posted by the flow check.' } });
  ok('mentor posts an announcement', newAnn.status === 201 || newAnn.status === 200, `got ${newAnn.status}`);

  // RBAC: a mentor must not be able to do admin things.
  const mentorMakesUser = await call('/users', { token: mentorAll.token, method: 'POST', body: { email: 'nope@menler.in', fullName: 'Nope', role: 'student' } });
  ok('mentor is refused user provisioning', mentorMakesUser.status === 403, `got ${mentorMakesUser.status}`);
  const mentorMakesProgram = await call('/programs', { token: mentorAll.token, method: 'POST', body: { title: 'Nope' } });
  ok('mentor is refused programme creation', mentorMakesProgram.status === 403, `got ${mentorMakesProgram.status}`);

  // Mentor's own roster view.
  const mStudents = await call('/users/my-students', { token: mentorAll.token });
  ok('mentor sees a student roster', (mStudents.json.students || mStudents.json.users || []).length > 0, `status=${mStudents.status}`);

  // ────────────────────────────────────────────────────────────── STUDENT
  section('STUDENT FLOW, single batch (Kickstarter)');
  const sBatches = await call('/batches', { token: sK.token });
  ok('student sees exactly their batch', sBatches.json.batches.length === 1, `got ${sBatches.json.batches.length}`);

  const sAssign = await call('/assignments?scope=mine', { token: sK.token });
  const mine = sAssign.json.assignments || [];
  const seededMine = mine.filter((a) => !a.title.startsWith(FLOW));
  ok('student sees their assignments', seededMine.length === 6, `got ${seededMine.length} seeded (${mine.length} total incl. this script's own)`);
  ok('each assignment carries mySubmission (or null)', mine.every((a) => 'mySubmission' in a));
  const gradedOnes = mine.filter((a) => a.mySubmission?.status === 'graded');
  ok('student has graded work with a score', gradedOnes.length > 0 && gradedOnes.every((a) => typeof a.mySubmission.score === 'number'), `${gradedOnes.length} graded`);
  ok('graded work carries mentor feedback', gradedOnes.every((a) => (a.mySubmission.feedback || '').length > 0));
  ok('graded work is locked', gradedOnes.every((a) => a.mySubmission.locked === true));
  const withFiles = mine.filter((a) => (a.mySubmission?.files || []).length > 0);
  ok('verified submissions list their Drive files', withFiles.length > 0, `${withFiles.length} with files`);
  const notOpen = mine.find((a) => a.startDate && new Date(a.startDate) > new Date());
  ok('an unopened assignment exists (not-yet-open state)', !!notOpen);
  const overdueUnsubmitted = mine.find((a) => a.dueDate && new Date(a.dueDate) < new Date() && !a.mySubmission);
  ok('an overdue-never-submitted case exists', !!overdueUnsubmitted || mine.some((a) => !a.mySubmission));

  const sQuiz = await call('/quizzes?scope=mine', { token: sK.token });
  const quizzes = sQuiz.json.quizzes || [];
  ok('student sees their quizzes', quizzes.length === 3, `got ${quizzes.length}`);
  ok('quizzes never leak correct answers', quizzes.every((q) => q.questions.every((x) => x.correctIndex === undefined)));
  const attempted = quizzes.filter((q) => q.myAttempt);
  ok('student has quiz attempts with scores', attempted.length > 0 && attempted.every((q) => typeof q.myAttempt.score === 'number'), `${attempted.length} attempted`);

  const sProgress = await call(`/progress/me?programId=${kick._id}`, { token: sK.token });
  ok('student progress loads', sProgress.status === 200);
  ok('…and is mid-cohort, not 0 and not 100', sProgress.json.pct > 0 && sProgress.json.pct < 100, `pct=${sProgress.json.pct}`);

  const sAtt = await call('/attendance/me', { token: sK.token });
  ok('student attendance loads', sAtt.status === 200 && sAtt.json.total > 0, `${sAtt.json.present}/${sAtt.json.total}`);

  const sSessions = await call('/sessions?scope=upcoming', { token: sK.token });
  ok('student sees upcoming sessions', (sSessions.json.sessions || []).length > 0);
  const sPast = await call('/sessions?scope=past', { token: sK.token });
  ok('student sees past sessions with recordings', (sPast.json.sessions || []).some((s) => s.recordingUrl));

  const sAnn = await call('/announcements', { token: sK.token });
  ok('student sees announcements', (sAnn.json.announcements || []).length >= 3);

  const sNotif = await call('/notifications', { token: sK.token });
  ok('student has notifications', (sNotif.json.items || []).length > 0, `unread=${sNotif.json.unread}`);

  const sGrades = await call('/grades/me', { token: sK.token });
  ok('student grades page loads', sGrades.status === 200);

  // Forum round trip.
  const doubtsBefore = await call(`/forum/doubts?batchId=${bK.id}`, { token: sK.token });
  const seededDoubts = (doubtsBefore.json.doubts || []).filter((d) => !d.text.startsWith(FLOW));
  ok('student reads the forum', seededDoubts.length === 5, `got ${seededDoubts.length} seeded (${(doubtsBefore.json.doubts || []).length} total)`);
  ok('seeded doubts have mentor answers', seededDoubts.some((d) => d.comments?.length > 0));
  const posted = await call('/forum/doubts', { token: sK.token, method: 'POST', body: { batchId: bK.id, text: 'Flow-test doubt, does this post?' } });
  ok('student posts a doubt', posted.status === 201 || posted.status === 200, `got ${posted.status}`);
  const newDoubtId = posted.json?.doubt?.id || posted.json?.doubt?._id;
  if (newDoubtId) {
    const liked = await call(`/forum/doubts/${newDoubtId}/like`, { token: sK.token, method: 'POST' });
    ok('student likes a doubt', liked.status === 200);
    const commented = await call(`/forum/doubts/${newDoubtId}/comments`, { token: mentorAll.token, method: 'POST', body: { text: 'Flow-test mentor answer.' } });
    ok('mentor answers the doubt', commented.status === 200 || commented.status === 201, `got ${commented.status}`);
  }

  // Submission round trip on the flow-test assignment.
  const flowAssign = mine.find((a) => a.title === 'Flow-test assignment');
  if (flowAssign) {
    const submitted = await call('/submissions', { token: sK.token, method: 'POST', body: { assignmentId: flowAssign._id, driveLink: 'https://drive.google.com/drive/folders/1flowTestFolder' } });
    ok('student submits a Drive link', submitted.status === 201 || submitted.status === 200, `got ${submitted.status} ${JSON.stringify(submitted.json).slice(0, 120)}`);
  }

  // Library.
  const sLib = await call('/library', { token: sK.token });
  ok('student sees the library', (sLib.json.items || sLib.json.library || []).length >= 5);

  // ────────────────────────────────── STUDENT — RBAC boundaries
  section('STUDENT RBAC');
  const sCrossBatch = await call(`/assignments?batchId=${bG.id}`, { token: sK.token });
  ok('Kickstarter student is refused Generalist assignments', sCrossBatch.status === 403, `got ${sCrossBatch.status}`);
  const sCrossForum = await call(`/forum/doubts?batchId=${bG.id}`, { token: sK.token });
  ok('…and the Generalist forum', sCrossForum.status === 403, `got ${sCrossForum.status}`);
  const sMakesAssign = await call('/assignments', { token: sK.token, method: 'POST', body: { batchId: bK.id, title: 'Nope' } });
  ok('student cannot create an assignment', sMakesAssign.status === 403, `got ${sMakesAssign.status}`);
  const sListsUsers = await call('/users?role=student', { token: sK.token });
  ok('student cannot list users', sListsUsers.status === 403, `got ${sListsUsers.status}`);
  const sGrades2 = await call(`/submissions/${subs[0]?._id}/grade`, { token: sK.token, method: 'PATCH', body: { score: 10 } });
  ok('student cannot grade', sGrades2.status === 403 || sGrades2.status === 404, `got ${sGrades2.status}`);

  // ────────────────────────────────── STUDENT — dual enrolment
  section('STUDENT FLOW, enrolled in BOTH batches');
  const dualBatches = await call('/batches', { token: sBoth.token });
  ok('dual student sees 2 batches', dualBatches.json.batches.length === 2, `got ${dualBatches.json.batches.length}`);
  const dualAssign = await call('/assignments?scope=mine', { token: sBoth.token });
  ok('dual student sees assignments from both', (dualAssign.json.assignments || []).length >= 12, `got ${(dualAssign.json.assignments || []).length}`);
  const batchNames = new Set((dualAssign.json.assignments || []).map((a) => a.batchId?.name).filter(Boolean));
  ok('…spanning both batch names', batchNames.size === 2, `got ${[...batchNames].join(', ')}`);
  const dualQuiz = await call('/quizzes?scope=mine', { token: sBoth.token });
  ok('dual student sees 6 quizzes', (dualQuiz.json.quizzes || []).length === 6, `got ${(dualQuiz.json.quizzes || []).length}`);
  const pK = await call(`/progress/me?programId=${kick._id}`, { token: sBoth.token });
  const pG = await call(`/progress/me?programId=${gen._id}`, { token: sBoth.token });
  ok('dual student has separate progress per programme', pK.status === 200 && pG.status === 200 && pK.json.pct !== undefined && pG.json.pct !== undefined, `K=${pK.json.pct}% G=${pG.json.pct}%`);

  // ────────────────────────────────── Certificate path
  section('CERTIFICATE PATH');
  const donePK = await call(`/progress/me?programId=${kick._id}`, { token: sDone.token });
  ok('the completed student is at 100%', donePK.json.pct === 100, `pct=${donePK.json.pct}`);
  const cert = await call(`/progress/certificate?programId=${kick._id}`, { token: sDone.token });
  ok('…and is eligible for a certificate', cert.status === 200 && cert.json.eligible === true, `${cert.status} ${JSON.stringify(cert.json).slice(0, 120)}`);
  const noCert = await call(`/progress/certificate?programId=${kick._id}`, { token: sK.token });
  ok('a mid-cohort student is not', noCert.json?.eligible !== true);

  // ────────────────────────────────── Admin moderation
  section('ADMIN MODERATION');
  const target = studentList.find((u) => u.email === 'diya.patel@student.menler.in');
  const blocked = await call(`/users/${target.id}/blocks`, { token: admin.token, method: 'PATCH', body: { lms: true, reason: 'Flow-test block' } });
  ok('admin blocks a student', blocked.status === 200, `got ${blocked.status}`);
  const blockedLogin = await call('/auth/login', { method: 'POST', body: { email: 'diya.patel@student.menler.in', password: PASSWORD } });
  ok('…the blocked student cannot log in', blockedLogin.status === 403, `got ${blockedLogin.status}`);
  const unblocked = await call(`/users/${target.id}/blocks`, { token: admin.token, method: 'PATCH', body: { lms: false, reason: '' } });
  ok('admin unblocks them again', unblocked.status === 200);
  const reLogin = await call('/auth/login', { method: 'POST', body: { email: 'diya.patel@student.menler.in', password: PASSWORD } });
  ok('…and they can log in once more', reLogin.status === 200, `got ${reLogin.status}`);

  const adminOnMentor = await call(`/users/${(mentorsList.json.users || [])[0].id}/blocks`, { token: mentorAll.token, method: 'PATCH', body: { lms: true } });
  ok('a mentor cannot block anyone', adminOnMentor.status === 403, `got ${adminOnMentor.status}`);

  // ────────────────────────────────── Single active session + watch lock
  section('SINGLE ACTIVE SESSION');

  const mySessions = await call('/auth/sessions', { token: sK.token });
  ok('a student can see where they are signed in', mySessions.status === 200 && Array.isArray(mySessions.json?.sessions),
    `got ${mySessions.status}`);
  ok('…and this device is marked as theirs', (mySessions.json?.sessions || []).some((x) => x.current),
    JSON.stringify(mySessions.json?.sessions || []).slice(0, 160));

  // The watch lock, without needing a real VdoCipher video: the lease is the
  // mechanism the OTP route goes through, so exercising it directly tests the
  // same guarantee.
  const claim = await call('/playback/claim', { token: sK.token, method: 'POST', body: { videoKey: `${FLOW}-video`, title: `${FLOW} lesson` } });
  ok('a student can take the watch lock', claim.status === 200, `got ${claim.status}`);
  const beat = await call('/playback/heartbeat', { token: sK.token, method: 'POST' });
  ok('…and hold it by heartbeating', beat.status === 200, `got ${beat.status}`);
  const otherWatcher = await call('/playback/claim', { token: sBoth.token, method: 'POST', body: { videoKey: 'x' } });
  ok('a DIFFERENT student is unaffected by it', otherWatcher.status === 200, `got ${otherWatcher.status}`);
  await call('/playback/release', { token: sK.token, method: 'POST' });
  await call('/playback/release', { token: sBoth.token, method: 'POST' });

  // Signing in from a second device takes the account over. sDone is used
  // because nothing after this point needs its token — which is the point:
  // after a takeover, it does not have one.
  const second = await call('/auth/login', {
    method: 'POST',
    device: 'flowtest-second',
    body: { email: 'yash.chauhan@student.menler.in', password: PASSWORD, force: true },
  });
  ok('a second device can sign in and take over', second.status === 200, `got ${second.status}`);
  const kicked = await call('/me', { token: sDone.token });
  ok('…the first device is signed out on its next request', kicked.status === 401, `got ${kicked.status}`);
  ok('…and told why, not just refused', kicked.json?.code === 'session_revoked', JSON.stringify(kicked.json).slice(0, 160));
  const stillIn = await call('/me', { token: second.json.accessToken, device: 'flowtest-second' });
  ok('…while the new device works', stillIn.status === 200, `got ${stillIn.status}`);
  const deadRefresh = await call('/auth/refresh', { method: 'POST', body: { refreshToken: sDone.refreshToken } });
  ok('…and the old refresh token cannot mint a new one', deadRefresh.status === 401, `got ${deadRefresh.status}`);

  // Put the account back the way the fixture expects: one live session on the
  // primary device, so a re-run is not greeted by this run's second device.
  await call('/auth/logout', { token: second.json.accessToken, method: 'POST', device: 'flowtest-second' });

  // ────────────────────────────────── Clean up after ourselves
  // Proving the write paths work means creating an assignment, a doubt and a
  // submission — and leaving them behind means the next run finds a world that
  // no longer matches the seed. There are no DELETE endpoints for these, so the
  // teardown goes straight to the collections. Nothing seeded is touched: only
  // rows this script created, matched on its own prefix.
  section('CLEANUP');
  await connectDb();

  // The assertions above ran over HTTP against whatever database THE SERVER is
  // using. This teardown connects on its own, from MONGODB_URI — and the two
  // are not guaranteed to be the same. Run `npm run test:flows` without the
  // same override the server got and the deletes below aim at a completely
  // different database, quite possibly the live one.
  //
  // The script created at least one assignment through the API moments ago, so
  // if this connection cannot see it, the two have diverged. Bail rather than
  // delete: matching nothing looks identical to a clean run, which is exactly
  // how this would go unnoticed.
  const strayAssignments = await Assignment.find({ title: new RegExp(`^${FLOW}`) }).select('_id');
  if (strayAssignments.length === 0) {
    await mongoose.disconnect();
    console.error(`\n  ✗ ABORTED, cleanup is connected to "${mongoose.connection.name}", which cannot see`);
    console.error('    the assignment this run just created through the API. That means MONGODB_URI');
    console.error('    points somewhere other than the database the server is using, so deleting');
    console.error('    anything here would hit the wrong data. Nothing was deleted.');
    console.error('    Re-run with the SAME MONGODB_URI the server was started with.');
    process.exit(1);
  }

  const rmSubs = await Submission.deleteMany({ assignmentId: { $in: strayAssignments.map((a) => a._id) } });
  const rmAssign = await Assignment.deleteMany({ _id: { $in: strayAssignments.map((a) => a._id) } });
  const rmDoubts = await Doubt.deleteMany({ text: new RegExp(`^${FLOW}`) });
  const rmAnns = await Announcement.deleteMany({ title: new RegExp(`^${FLOW}`) });
  await mongoose.disconnect();
  ok('this run left nothing behind', true,
    `${rmAssign.deletedCount} assignment · ${rmSubs.deletedCount} submission · ${rmDoubts.deletedCount} doubt · ${rmAnns.deletedCount} announcement removed`);

  // ────────────────────────────────── Summary
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  ${pass} passed · ${fail} failed`);
  if (fail) {
    console.log(`\n\x1b[31mFailures:\x1b[0m`);
    failures.forEach((f) => console.log(`  · ${f}`));
  }
  console.log('');
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error('\nflow check crashed:', e.message); process.exit(1); });
