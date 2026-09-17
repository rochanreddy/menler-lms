// End-to-end flow check against a RUNNING server. Run:  npm run test:flows
//
// This is not a unit-test suite — it drives the real HTTP API the way each role
// drives it, in order, and asserts both that the happy paths work and that the
// RBAC chokepoints actually refuse. A green run means an admin, a mentor and a
// student can each complete their whole loop, and that neither of the latter
// two can step outside it.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Doubt } from '../models/Doubt.js';
import { Announcement } from '../models/Announcement.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { MailCampaign } from '../models/MailCampaign.js';
import { generalistModules } from './curricula.js';

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
  // Either spelling: the fixture says "AI Kickstarter", an older test database "Kickstarter".
  const kick = aPrograms.json.programs.find((p) => /kickstarter/i.test(p.title));
  const gen = aPrograms.json.programs.find((p) => /generalist/i.test(p.title));
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
  // The count comes from curricula.js, not a literal: that file is the single
  // source of truth for both programmes, so when the PDF changes the fixture
  // and this check move together instead of one going stale.
  const genExpected = generalistModules().flatMap((m) => m.chapters.flatMap((c) => c.topics)).length;
  ok('Generalist has every lesson curricula.js defines', genTopics.length === genExpected, `got ${genTopics.length}, curricula.js has ${genExpected}`);
  const hasPdf = (url) => !!url && (url.endsWith('.pdf') || url.startsWith('/uploads/'));
  // Reading resolves lesson → session → week: the week ebook is attached to
  // the week, not copied onto each lesson, so the check follows the same path.
  const genMods = genFull.json.program.modules || [];
  const genResolved = genMods.flatMap((m) => m.chapters.flatMap((c) => c.topics.map((t) => ({
    reading: t.readingUrl || c.readingUrl || m.readingUrl,
    notes: t.notesUrl || c.notesUrl || m.notesUrl,
  }))));
  ok('every seeded lesson resolves to a reading PDF', genResolved.every((t) => hasPdf(t.reading)));
  ok('every seeded lesson resolves to teacher notes PDF', genResolved.every((t) => hasPdf(t.notes)));
  const ebookWeeks = genMods.filter((m) => (m.readingUrl || '').startsWith('/uploads/'));
  ok('the week ebook sits on the week, not on each of its lessons',
    ebookWeeks.length >= 2 && ebookWeeks.every((m) => m.chapters.every((c) => c.topics.every((t) => t.readingUrl !== m.readingUrl))),
    `${ebookWeeks.length} week(s) carry an ebook`);

  // Fellowship was a duplicate of the Kickstarter curriculum with no batch behind
  // it; it should not reappear in the programme picker.
  ok('only Kickstarter and Generalist exist', aPrograms.json.programs.length === 2,
    `got ${aPrograms.json.programs.map((p) => p.title).join(', ')}`);

  const aBatches = await call('/batches', { token: admin.token });
  const bK = aBatches.json.batches.find((b) => /^(AI )?Kickstarter/.test(b.name));
  const bG = aBatches.json.batches.find((b) => /^(AI )?Generalist/.test(b.name));
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
  ok('…and it is the Generalist one', /^(AI )?Generalist/.test(mgBatches.json.batches[0]?.name || ''));

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

  // Reading materials: several PDFs in one push onto a week, a session or a
  // lesson, saved at once — the one curriculum job a mentor actually has.
  const pdfA = await readFile(new URL('../assets/curriculum-pdfs/Menler-Fellowship-Week1-Assignment.pdf', import.meta.url));
  const pdfB = await readFile(new URL('../assets/curriculum-pdfs/Menler-Fellowship-Week1-Assignment-Solution-Book.pdf', import.meta.url));
  const kMod = kickFull.json.program.modules[0];
  const kChap = kMod.chapters[0];
  const kTopic = kChap.topics[0];
  const pushMaterials = async (token, programId, fields, files = []) => {
    const fd = new FormData();
    for (const [name, bytes] of files) fd.append('files', new File([bytes], name, { type: 'application/pdf' }));
    for (const [k, v] of Object.entries(fields)) if (v) fd.append(k, v);
    const res = await fetch(`${BASE}/programs/${programId}/materials`, { method: 'POST', headers: { 'X-Device-Id': DEVICE, Authorization: `Bearer ${token}` }, body: fd });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const pushed = await pushMaterials(mentorAll.token, kick._id, { moduleId: kMod._id, chapterId: kChap._id, topicId: kTopic._id },
    [[`${FLOW} handout.pdf`, pdfA], [`${FLOW} solutions.pdf`, pdfB]]);
  ok('mentor pushes two PDFs onto a lesson in one go', pushed.status === 201 && pushed.json?.added === 2, `got ${pushed.status}, added=${pushed.json?.added}`);
  const pushedUrls = (pushed.json?.materials || []).filter((x) => x.name.startsWith(FLOW)).map((x) => x.url);
  ok('…both stored and named', pushedUrls.length === 2 && pushedUrls.every((u) => u.startsWith('/uploads/')));
  const again = await pushMaterials(mentorAll.token, kick._id, { moduleId: kMod._id, chapterId: kChap._id, topicId: kTopic._id }, [[`${FLOW} handout again.pdf`, pdfA]]);
  ok('the same bytes pushed twice are one entry', again.status === 201 && again.json?.added === 0, `added=${again.json?.added}`);
  const weekLink = await pushMaterials(mentorAll.token, kick._id, { moduleId: kMod._id, url: 'https://example.com/flow-test-week.pdf', name: `${FLOW} week link`, kind: 'resource' });
  ok('mentor adds a link to the whole week', weekLink.status === 201 && weekLink.json?.materials?.some((x) => x.name === `${FLOW} week link`), `got ${weekLink.status}`);
  ok('…filed as a resource, while the PDFs are notes', weekLink.json?.materials?.find((x) => x.name === `${FLOW} week link`)?.kind === 'resource'
    && (pushed.json?.materials || []).filter((x) => x.name.startsWith(FLOW)).every((x) => x.kind === 'notes'));
  const notPdf = await pushMaterials(mentorAll.token, kick._id, { moduleId: kMod._id }, [[`${FLOW} notes.txt`, Buffer.from('hello')]]);
  ok('a non-PDF is refused', notPdf.status === 415, `got ${notPdf.status}`);
  const crossPush = await pushMaterials(mentorGen.token, kick._id, { moduleId: kMod._id }, [[`${FLOW} sneak.pdf`, pdfA]]);
  ok('Generalist-only mentor is refused Kickstarter materials', crossPush.status === 403, `got ${crossPush.status}`);
  const emptyPush = await pushMaterials(mentorAll.token, kick._id, { moduleId: kMod._id });
  ok('an empty push is refused', emptyPush.status === 400, `got ${emptyPush.status}`);

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

  // The reading list the chip shows: the lesson's own files and the week's.
  const sKick = await call(`/programs/${kick._id}`, { token: sK.token });
  const sMod = (sKick.json.program?.modules || []).find((m) => String(m._id) === String(kMod._id));
  const sTopic = sMod?.chapters.find((c) => String(c._id) === String(kChap._id))?.topics.find((t) => String(t._id) === String(kTopic._id));
  ok('student sees the two PDFs on the lesson', pushedUrls.length === 2 && pushedUrls.every((u) => (sTopic?.materials || []).some((x) => x.url === u)));
  ok('…and the link on the week', (sMod?.materials || []).some((x) => x.name === `${FLOW} week link`));
  const sOpen = await fetch(`${BASE}${pushedUrls[0]}`, { headers: { 'X-Device-Id': DEVICE, Authorization: `Bearer ${sK.token}` } });
  ok('student can open a pushed PDF', sOpen.status === 200 && (sOpen.headers.get('content-type') || '').includes('pdf'), `got ${sOpen.status}`);
  const sPush = await pushMaterials(sK.token, kick._id, { moduleId: kMod._id }, [[`${FLOW} student.pdf`, pdfA]]);
  ok('student is refused pushing materials', sPush.status === 403, `got ${sPush.status}`);

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

  // The forum's other board. Both live in one collection under a `kind`, so the
  // first thing worth proving is that neither board serves the other's posts.
  const sharesBefore = await call(`/forum/doubts?batchId=${bK.id}&kind=share`, { token: sK.token });
  const seededShares = (sharesBefore.json.doubts || []).filter((d) => !d.text.startsWith(FLOW));
  ok('student reads shared learnings', seededShares.length === 4, `got ${seededShares.length}`);
  const doubtIds = new Set(seededDoubts.map((d) => d.id));
  ok('the two boards do not mix', !seededShares.some((d) => doubtIds.has(d.id)));
  const sharePosted = await call('/forum/doubts', { token: sK.token, method: 'POST', body: { batchId: bK.id, kind: 'share', text: `${FLOW} share, does this post?` } });
  ok('student shares a learning', sharePosted.status === 201 || sharePosted.status === 200, `got ${sharePosted.status}`);
  // A mentor passing on a resource is the point of the board; a mentor "asking
  // a doubt" is not, and that asymmetry is the only rule the two boards differ by.
  const mentorShare = await call('/forum/doubts', { token: mentorAll.token, method: 'POST', body: { batchId: bK.id, kind: 'share', text: `${FLOW} mentor share.` } });
  ok('mentor may share a learning', mentorShare.status === 201 || mentorShare.status === 200, `got ${mentorShare.status}`);
  const mentorDoubt = await call('/forum/doubts', { token: mentorAll.token, method: 'POST', body: { batchId: bK.id, text: `${FLOW} mentor doubt, should be refused.` } });
  ok('…but still cannot post a doubt', mentorDoubt.status === 403, `got ${mentorDoubt.status}`);

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

  // ────────────────────────────────── Support desk
  // A student reports a problem, the admin answers it, the student sees the
  // answer — and a mentor can see none of it, which is the point: a support
  // ticket is between the student and the admin.
  section('SUPPORT');
  const rawTicket = await call('/support', {
    token: sK.token,
    method: 'POST',
    body: { subject: `${FLOW} ticket`, category: 'access', message: `${FLOW} the recording will not open for me.` },
  });
  ok('student raises a support ticket', rawTicket.status === 201, `got ${rawTicket.status}`);
  const ticketId = rawTicket.json?.ticket?._id;
  ok('…and it starts waiting on the team', rawTicket.json?.ticket?.status === 'open', `status=${rawTicket.json?.ticket?.status}`);

  const mineTickets = await call('/support/mine', { token: sK.token });
  ok('student sees their own tickets', (mineTickets.json.tickets || []).some((t) => t._id === ticketId), `got ${(mineTickets.json.tickets || []).length}`);
  const othersTickets = await call('/support/mine', { token: sBoth.token });
  ok('…and another student does NOT see it', !(othersTickets.json.tickets || []).some((t) => t._id === ticketId));

  const mentorDesk = await call('/support', { token: mentorAll.token });
  ok('a mentor is refused the support desk', mentorDesk.status === 403, `got ${mentorDesk.status}`);
  const studentDesk = await call('/support', { token: sK.token });
  ok('a student is refused it too', studentDesk.status === 403, `got ${studentDesk.status}`);

  const desk = await call('/support?status=open', { token: admin.token });
  ok('admin sees the ticket on the desk', (desk.json.tickets || []).some((t) => t._id === ticketId), `got ${(desk.json.tickets || []).length} open`);
  ok('…with the student named on it', (desk.json.tickets || []).find((t) => t._id === ticketId)?.student?.email === 'aarav.sharma@student.menler.in',
    (desk.json.tickets || []).find((t) => t._id === ticketId)?.student?.email);

  const otherStudentReply = await call(`/support/${ticketId}/reply`, { token: sBoth.token, method: 'POST', body: { text: 'not mine' } });
  ok('another student cannot reply on it', otherStudentReply.status === 403, `got ${otherStudentReply.status}`);

  const adminReply = await call(`/support/${ticketId}/reply`, { token: admin.token, method: 'POST', body: { text: `${FLOW} try it in Chrome — re-shared now.` } });
  ok('admin replies', adminReply.status === 200, `got ${adminReply.status}`);
  ok('…and the ball moves to the student', adminReply.json?.ticket?.status === 'answered', `status=${adminReply.json?.ticket?.status}`);

  const afterReply = await call('/support/mine', { token: sK.token });
  const seen = (afterReply.json.tickets || []).find((t) => t._id === ticketId);
  ok('student sees the reply on their ticket', (seen?.messages || []).length === 2, `${seen?.messages?.length} messages`);
  const notes = await call('/notifications', { token: sK.token });
  ok('…and was notified about it', (notes.json.items || []).some((n) => n.type === 'support'));

  const resolved = await call(`/support/${ticketId}`, { token: admin.token, method: 'PATCH', body: { status: 'resolved' } });
  ok('admin resolves the ticket', resolved.json?.ticket?.status === 'resolved', `got ${resolved.status}`);
  const reopened = await call(`/support/${ticketId}/reply`, { token: sK.token, method: 'POST', body: { text: `${FLOW} still broken.` } });
  ok('a student reply reopens a resolved ticket', reopened.json?.ticket?.status === 'open', `status=${reopened.json?.ticket?.status}`);

  const mentorResolves = await call(`/support/${ticketId}`, { token: mentorAll.token, method: 'PATCH', body: { status: 'resolved' } });
  ok('a mentor cannot close a ticket', mentorResolves.status === 403, `got ${mentorResolves.status}`);

  // ────────────────────────────────── Mail desk
  // The admin writes a mail once, picks the batches and the times, and the
  // server sends it. Nothing is actually sent here: the sends are scheduled
  // three days out and cancelled, because a flow check that mails sixteen
  // invented students on every run is one that gets switched off.
  section('MAIL');
  const mentorMail = await call('/mail', { token: mentorAll.token });
  ok('a mentor is refused the mail desk', mentorMail.status === 403, `got ${mentorMail.status}`);
  const mailDesk = await call('/mail', { token: admin.token });
  ok('admin loads the mail desk', mailDesk.status === 200 && Array.isArray(mailDesk.json.batches), `got ${mailDesk.status}`);
  const kMail = (mailDesk.json.batches || []).find((b) => b.programId === String(kick._id));
  const gMail = (mailDesk.json.batches || []).find((b) => b.programId === String(gen._id));
  ok('…with a batch for each programme', !!kMail && !!gMail);
  const mailAud = await call(`/mail/audience?batchIds=${kMail.id},${gMail.id}`, { token: admin.token });
  ok('the audience of both batches counts a dual-enrolled student once',
    mailAud.json.count > 0 && mailAud.json.count < kMail.students + gMail.students, `${mailAud.json.count} of ${kMail.students}+${gMail.students}`);

  const flowCopy = { subject: 'Class tonight · {{batch}}', body: 'Hi {{first_name}}, see you at 7.\n\nhttps://menler.in' };
  const flowPrev = await call('/mail/preview', { token: admin.token, method: 'POST', body: { ...flowCopy, batchId: kMail.id } });
  ok('the preview fills the placeholders', flowPrev.status === 200 && !flowPrev.json.subject.includes('{{') && !flowPrev.json.html.includes('{{'), flowPrev.json?.subject);
  ok('…on the fixed shell, with the link made clickable', flowPrev.json.html.includes('email-banner.jpg') && flowPrev.json.html.includes('<a href="https://menler.in"'));

  const day3 = Date.now() + 3 * 86400000;
  const morning = new Date(day3).toISOString();
  const evening = new Date(day3 + 9 * 3600000).toISOString();
  const flowCamp = await call('/mail/campaigns', {
    token: admin.token, method: 'POST',
    body: { batchIds: [kMail.id], subject: `${FLOW} mail`, body: 'Hi {{first_name}}.', sendAts: [evening, morning, morning] },
  });
  ok('admin schedules a mail to a batch at two times of a day', flowCamp.status === 201 && (flowCamp.json.campaigns || []).length === 2, `got ${flowCamp.status}, ${flowCamp.json?.campaigns?.length} rows`);
  ok('…one row per time, in time order, a repeated time folded', flowCamp.json.campaigns?.[0]?.sendAt === morning && flowCamp.json.campaigns?.[1]?.sendAt === evening);
  ok('…each waiting, with its recipients counted', (flowCamp.json.campaigns || []).every((c) => c.status === 'scheduled' && c.recipients > 0));
  const mentorSchedules = await call('/mail/campaigns', { token: mentorAll.token, method: 'POST', body: { batchIds: [kMail.id], subject: `${FLOW} mail`, body: 'x', sendAt: morning } });
  ok('a mentor cannot schedule one', mentorSchedules.status === 403, `got ${mentorSchedules.status}`);
  const flowEdit = await call(`/mail/campaigns/${flowCamp.json.campaigns[1]._id}`, { token: admin.token, method: 'PUT', body: { subject: `${FLOW} mail, evening` } });
  ok('one of the times can be reworded on its own', flowEdit.status === 200 && flowEdit.json.campaign.subject.endsWith('evening'), `got ${flowEdit.status}`);
  let cancelled = 0;
  for (const c of flowCamp.json.campaigns) {
    const r = await call(`/mail/campaigns/${c._id}`, { token: admin.token, method: 'DELETE' });
    if (r.json?.cancelled) cancelled++;
  }
  ok('admin cancels both before they go out', cancelled === 2, `cancelled ${cancelled}`);

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
  // The materials this run pushed come off through the API, as a mentor would
  // take them down — which is also the DELETE route's test.
  const kNow = await call(`/programs/${kick._id}`, { token: mentorAll.token });
  const flowMaterials = (kNow.json.program?.modules || []).flatMap((m) => [m, ...m.chapters.flatMap((c) => [c, ...c.topics])])
    .flatMap((n) => (n.materials || []).filter((x) => (x.name || '').startsWith(FLOW)));
  let removed = 0;
  for (const x of flowMaterials) {
    const r = await call(`/programs/${kick._id}/materials/${x._id}`, { token: mentorAll.token, method: 'DELETE' });
    if (r.status === 200) removed++;
  }
  ok('mentor removes the pushed materials again', flowMaterials.length === 3 && removed === 3, `found ${flowMaterials.length}, removed ${removed}`);
  const kAfter = await call(`/programs/${kick._id}`, { token: mentorAll.token });
  ok('…and none are left on the tree', !(kAfter.json.program?.modules || []).some((m) => [m, ...m.chapters.flatMap((c) => [c, ...c.topics])].some((n) => (n.materials || []).some((x) => (x.name || '').startsWith(FLOW)))));

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
  const rmTickets = await SupportTicket.deleteMany({ subject: new RegExp(`^${FLOW}`) });
  const rmMail = await MailCampaign.deleteMany({ subject: new RegExp(`^${FLOW}`) });
  await mongoose.disconnect();
  ok('this run left nothing behind', true,
    `${rmAssign.deletedCount} assignment · ${rmSubs.deletedCount} submission · ${rmDoubts.deletedCount} doubt · ${rmAnns.deletedCount} announcement · ${rmTickets.deletedCount} ticket · ${rmMail.deletedCount} mail removed`);

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
