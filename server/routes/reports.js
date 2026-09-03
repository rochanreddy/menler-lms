import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isMentorOfBatch } from '../utils/access.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Attendance } from '../models/Attendance.js';

const router = Router();

// All reports are admin-only CSV downloads. CSV is built by hand — no library
// needed for simple escaped rows, and Excel/Sheets open it directly.
const esc = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Formula injection: quoting makes a cell parse correctly, but Excel and
  // Sheets still EXECUTE a value that opens with = + - or @. These rows carry
  // student names and free-text mentor feedback, so a display name of
  // `=HYPERLINK("http://evil","click")` becomes a live link in the admin's
  // spreadsheet. A leading apostrophe forces it to text; it is the standard
  // defence and is invisible in the cell.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => rows.map((r) => r.map(esc).join(',')).join('\r\n');
const sendCsv = (res, filename, rows) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel detects UTF-8.
  res.send('﻿' + toCsv(rows));
};
const pct = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : '');

// GET /api/lms/reports/platform, one row per batch: enrolment + engagement.
router.get('/platform', requireAuth, requireRole('admin'), async (_req, res) => {
  const batches = await Batch.find().populate('programId', 'title').sort({ createdAt: -1 });
  const batchIds = batches.map((b) => b._id);
  const [assignments, attendance] = await Promise.all([
    Assignment.find({ batchId: { $in: batchIds } }).select('batchId'),
    Attendance.find({ batchId: { $in: batchIds } }).select('batchId status'),
  ]);
  const submissions = await Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) } }).select('assignmentId status');
  const batchOfAssignment = new Map(assignments.map((a) => [String(a._id), String(a.batchId)]));

  // Group each collection by batch ONCE, the loop below was re-scanning
  // the full assignments/attendance/submissions arrays for every batch
  // (O(batches × rows)); this makes each row an O(1) Map lookup instead.
  const assignmentsByBatch = new Map();
  for (const a of assignments) {
    const k = String(a.batchId);
    assignmentsByBatch.set(k, (assignmentsByBatch.get(k) || 0) + 1);
  }
  const attendanceByBatch = new Map();
  for (const a of attendance) {
    const k = String(a.batchId);
    const v = attendanceByBatch.get(k) || { total: 0, present: 0 };
    v.total += 1;
    if (a.status === 'present') v.present += 1;
    attendanceByBatch.set(k, v);
  }
  const submissionsByBatch = new Map();
  for (const s of submissions) {
    const k = batchOfAssignment.get(String(s.assignmentId));
    if (!k) continue;
    const v = submissionsByBatch.get(k) || { total: 0, graded: 0 };
    v.total += 1;
    if (s.status === 'graded') v.graded += 1;
    submissionsByBatch.set(k, v);
  }

  const rows = [['Batch', 'Program', 'Status', 'Students', 'Mentors', 'Assignments', 'Submissions', 'Graded', 'Attendance %']];
  for (const b of batches) {
    const bid = String(b._id);
    const att = attendanceByBatch.get(bid) || { total: 0, present: 0 };
    const subs = submissionsByBatch.get(bid) || { total: 0, graded: 0 };
    rows.push([
      b.name,
      b.programId?.title || '',
      b.status,
      b.studentIds.length,
      b.mentorIds.length,
      assignmentsByBatch.get(bid) || 0,
      subs.total,
      subs.graded,
      pct(att.present, att.total),
    ]);
  }
  sendCsv(res, 'menler-platform-report.csv', rows);
});

// GET /api/lms/reports/batch/:id, one row per enrolled student. Admin, or the
// mentor who runs this batch.
router.get('/batch/:id', requireAuth, requireRole('admin', 'mentor'), async (req, res) => {
  if (!(await isMentorOfBatch(req.user, req.params.id))) return res.status(403).json({ error: 'Forbidden.' });
  const batch = await Batch.findById(req.params.id).populate('programId', 'title').populate('studentIds', 'fullName email blocked lastActiveAt');
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });

  const [assignments, quizzes, attendance] = await Promise.all([
    Assignment.find({ batchId: batch._id }).select('_id'),
    Quiz.find({ batchId: batch._id }).select('_id'),
    Attendance.find({ batchId: batch._id }).select('studentId status'),
  ]);
  const [submissions, attempts] = await Promise.all([
    Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) } }).select('studentId status score'),
    QuizAttempt.find({ quizId: { $in: quizzes.map((q) => q._id) } }).select('studentId score total'),
  ]);

  const rows = [['Student', 'Email', 'Attendance %', 'Submitted', 'Graded', 'Avg score', 'Quizzes taken', 'Quiz avg %', 'Blocked', 'Last active']];
  for (const s of batch.studentIds) {
    const sid = String(s._id);
    const att = attendance.filter((a) => String(a.studentId) === sid);
    const subs = submissions.filter((x) => String(x.studentId) === sid);
    const graded = subs.filter((x) => x.status === 'graded' && x.score != null);
    const myAttempts = attempts.filter((a) => String(a.studentId) === sid);
    const quizAvg = myAttempts.length
      ? Math.round(myAttempts.reduce((n, a) => n + (a.total ? (a.score / a.total) * 100 : 0), 0) / myAttempts.length)
      : null;
    rows.push([
      s.fullName || '',
      s.email,
      pct(att.filter((a) => a.status === 'present').length, att.length),
      `${subs.length}/${assignments.length}`,
      graded.length,
      graded.length ? (graded.reduce((n, x) => n + x.score, 0) / graded.length).toFixed(1) : '',
      `${myAttempts.length}/${quizzes.length}`,
      quizAvg === null ? '' : `${quizAvg}%`,
      s.blocked?.lms ? 'YES' : '',
      s.lastActiveAt ? new Date(s.lastActiveAt).toISOString().slice(0, 10) : '',
    ]);
  }
  const safe = batch.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  sendCsv(res, `batch-${safe}-report.csv`, rows);
});

// GET /api/lms/reports/student/:id, full academic record for one student.
// Admin, or a mentor whose batch the student is in.
router.get('/student/:id', requireAuth, requireRole('admin', 'mentor'), async (req, res) => {
  const student = await User.findById(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (req.user.role === 'mentor') {
    const shares = await Batch.exists({ mentorIds: req.user._id, studentIds: student._id });
    if (!shares) return res.status(403).json({ error: 'This student is not in any of your batches.' });
  }

  const batches = await Batch.find({ studentIds: student._id }).populate('programId', 'title');
  const batchIds = batches.map((b) => b._id);
  const batchName = new Map(batches.map((b) => [String(b._id), b.name]));

  const [assignments, attendance] = await Promise.all([
    Assignment.find({ batchId: { $in: batchIds } }).sort({ createdAt: 1 }),
    Attendance.find({ studentId: student._id }).select('batchId status'),
  ]);
  const [submissions, quizzes] = await Promise.all([
    Submission.find({ studentId: student._id }).select('assignmentId status score feedback updatedAt'),
    Quiz.find({ batchId: { $in: batchIds } }).select('title batchId'),
  ]);
  const attempts = await QuizAttempt.find({ studentId: student._id, quizId: { $in: quizzes.map((q) => q._id) } });
  const subByAssignment = new Map(submissions.map((s) => [String(s.assignmentId), s]));
  const quizById = new Map(quizzes.map((q) => [String(q._id), q]));

  const rows = [
    ['Student report', student.fullName || student.email],
    ['Email', student.email],
    ['Blocked', student.blocked?.lms ? `YES: ${student.blocked?.reason || ''}` : 'No'],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    ['Batch', 'Program', 'Status', 'Attendance %'],
  ];
  for (const b of batches) {
    const att = attendance.filter((a) => String(a.batchId) === String(b._id));
    rows.push([b.name, b.programId?.title || '', b.status, pct(att.filter((a) => a.status === 'present').length, att.length)]);
  }

  rows.push([], ['Assignment / Project', 'Type', 'Batch', 'Due', 'Status', 'Score', 'Feedback']);
  for (const a of assignments) {
    const s = subByAssignment.get(String(a._id));
    rows.push([
      a.title,
      a.type,
      batchName.get(String(a.batchId)) || '',
      a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : '',
      s ? s.status : 'not submitted',
      s?.score ?? '',
      s?.feedback || '',
    ]);
  }

  rows.push([], ['Quiz', 'Batch', 'Score', 'Total', 'Taken on']);
  for (const a of attempts) {
    const q = quizById.get(String(a.quizId));
    rows.push([q?.title || '', batchName.get(String(q?.batchId)) || '', a.score, a.total, a.createdAt.toISOString().slice(0, 10)]);
  }

  const safe = (student.fullName || student.email).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  sendCsv(res, `student-${safe}-report.csv`, rows);
});

export default router;
