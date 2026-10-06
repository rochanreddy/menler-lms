import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Attendance } from '../models/Attendance.js';
import { Progress } from '../models/Progress.js';
import { Session } from '../models/Session.js';
import { ClassReview } from '../models/ClassReview.js';
import { Doubt } from '../models/Doubt.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { MailCampaign } from '../models/MailCampaign.js';
import { isMentorOfBatch, myBatchIds } from '../utils/access.js';
import { sessionEnd } from '../utils/sessionTime.js';

const router = Router();

// GET /api/lms/stats/overview — admin platform analytics: headline counts +
// student distribution per batch (for the chart).
router.get('/overview', requireAuth, requireRole('admin'), async (_req, res) => {
  const [students, mentors, batches, programs, quizzes] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'mentor' }),
    Batch.countDocuments(),
    Program.countDocuments(),
    Quiz.countDocuments(),
  ]);
  const batchDocs = await Batch.find().select('name studentIds').sort({ createdAt: -1 });
  const perBatch = batchDocs.map((b) => ({ name: b.name.replace(/^Demo[^A-Za-z0-9]+/, ''), count: b.studentIds.length }));
  res.json({ stats: { students, mentors, batches, programs, quizzes }, perBatch });
});

const DAY = 24 * 60 * 60 * 1000;
const key = (studentId, scopeId) => `${studentId}:${scopeId}`;

// GET /api/lms/stats/admin-dashboard — the admin Home in one round trip.
//
// One block per batch, and the page adds them up. The dashboard's filter is
// "which cohort", and a set of platform-wide totals cannot answer it: 51%
// attendance across two courses says nothing about either. So every number is
// kept at the level it can be filtered at — who was in each class, who handed
// in each piece of work — and "All batches" is the client summing the blocks.
// That is also what the engagement grid is drawn from, so the headline figures
// and the grid under them cannot disagree.
router.get('/admin-dashboard', requireAuth, requireRole('admin'), async (_req, res) => {
  const now = Date.now();
  const [students, blockedUsers, batchDocs, openTickets, scheduledMails] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ 'blocked.lms': true }),
    Batch.find().select('name studentIds programId').populate('programId', 'title modules').sort({ createdAt: 1 }),
    SupportTicket.countDocuments({ status: 'open' }),
    MailCampaign.countDocuments({ status: 'scheduled' }),
  ]);

  const batchIds = batchDocs.map((b) => b._id);
  const studentIds = [...new Set(batchDocs.flatMap((b) => b.studentIds.map(String)))];
  const programIds = batchDocs.map((b) => b.programId?._id).filter(Boolean);

  const [users, sessions, assignments, doubts, progress] = await Promise.all([
    User.find({ _id: { $in: studentIds } }).select('fullName email lastActiveAt'),
    Session.find({ batchId: { $in: batchIds } }).select('batchId title startsAt endsAt joinUrl').sort({ startsAt: 1 }),
    Assignment.find({ batchId: { $in: batchIds } }).select('batchId title type createdAt').sort({ createdAt: 1, _id: 1 }),
    Doubt.find({ batchId: { $in: batchIds }, kind: 'doubt', comments: { $size: 0 } }).select('batchId'),
    Progress.find({ studentId: { $in: studentIds }, programId: { $in: programIds } }).select('studentId programId completedTopics'),
  ]);
  const [attendance, reviews, submissions] = await Promise.all([
    Attendance.find({ sessionId: { $in: sessions.map((s) => s._id) } }).select('sessionId studentId status'),
    ClassReview.find({ sessionId: { $in: sessions.map((s) => s._id) } }).select('sessionId overall'),
    Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) }, isDeleted: false }).select('assignmentId studentId status'),
  ]);

  const nameOf = new Map(users.map((u) => [String(u._id), u.fullName || u.email]));
  // Stamped on any request the student makes (middleware/auth.js), so it is
  // "last opened the LMS", not "last typed a password".
  const lastActiveOf = new Map(users.map((u) => [String(u._id), u.lastActiveAt || null]));
  const group = (rows, keyOf) => {
    const map = new Map();
    for (const r of rows) { const k = String(keyOf(r)); map.set(k, [...(map.get(k) || []), r]); }
    return map;
  };
  const attBySession = group(attendance, (a) => a.sessionId);
  const reviewsBySession = group(reviews, (r) => r.sessionId);
  const subsByAssignment = group(submissions, (s) => s.assignmentId);
  const doneLessons = new Map(progress.map((p) => [key(p.studentId, p.programId), (p.completedTopics || []).length]));

  const batches = batchDocs.map((b) => {
    const bid = String(b._id);
    const enrolled = new Set(b.studentIds.map(String));
    const mine = sessions.filter((s) => String(s.batchId) === bid);

    // A class is on the board once it is over. One still running has half a
    // register, and would drag the average down for the length of the class.
    const classes = mine.filter((s) => sessionEnd(s) <= now).map((s) => {
      // Only the students enrolled today: someone removed from the batch has
      // no row in the grid, so they must not sit in its column totals either.
      const marks = {};
      for (const a of attBySession.get(String(s._id)) || []) {
        if (enrolled.has(String(a.studentId))) marks[String(a.studentId)] = a.status === 'present' ? 'p' : 'a';
      }
      const scores = (reviewsBySession.get(String(s._id)) || []).map((r) => r.overall).filter(Boolean);
      return {
        id: String(s._id),
        title: s.title,
        startsAt: s.startsAt,
        marks,
        reviews: scores.length,
        rating: scores.length ? Math.round((scores.reduce((n, v) => n + v, 0) / scores.length) * 10) / 10 : null,
      };
    });

    const next = mine.find((s) => sessionEnd(s) > now);

    const work = assignments.filter((a) => String(a.batchId) === bid).map((a) => {
      const by = {};
      for (const s of subsByAssignment.get(String(a._id)) || []) {
        if (enrolled.has(String(s.studentId))) by[String(s.studentId)] = s.status === 'graded' ? 'g' : 's';
      }
      return { id: String(a._id), title: a.title, type: a.type, by };
    });

    const lessonTotal = (b.programId?.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0);
    const lessonsDone = [...enrolled].reduce((n, sid) => n + Math.min(doneLessons.get(key(sid, b.programId?._id)) || 0, lessonTotal), 0);

    return {
      id: bid,
      name: b.name.replace(/^Demo[^A-Za-z0-9]+/, ''),
      program: b.programId?.title || '',
      students: [...enrolled]
        .filter((sid) => nameOf.has(sid))
        .map((sid) => ({ id: sid, name: nameOf.get(sid), lastActiveAt: lastActiveOf.get(sid) }))
        .sort((x, y) => x.name.localeCompare(y.name)),
      classes,
      nextClass: next ? { title: next.title, startsAt: next.startsAt, hasLink: !!next.joinUrl } : null,
      work,
      lessons: { done: lessonsDone, total: lessonTotal * enrolled.size },
      unansweredDoubts: doubts.filter((d) => String(d.batchId) === bid).length,
    };
  });

  res.json({
    // `students` is every student account; the page counts the ENROLLED ones
    // itself, per batch, and says so when the two differ.
    stats: { students, blockedUsers },
    // Not tied to a batch: a ticket is a person's and a mail can go to both.
    desk: { openTickets, scheduledMails },
    batches,
  });
});

// ── At-risk detection ──


/**
 * Turn one student's engagement metrics into a risk score plus the reasons
 * behind it. Signals are independent and additive — a student failing on two
 * fronts outranks one who's merely quiet. Every signal carries a human-readable
 * reason so the mentor sees WHAT to act on, not just a number.
 *
 * Each signal stays silent until there's enough data to justify it (e.g. no
 * attendance verdict before 3 marked sessions), which keeps a brand-new cohort
 * from lighting up red on day one.
 */
function assess(m) {
  const reasons = [];
  let score = 0;
  const flag = (points, label, detail) => { score += points; reasons.push({ label, detail }); };

  if (m.attendanceTotal >= 3) {
    if (m.attendancePct < 50) flag(3, 'Low attendance', `${m.attendancePct}% present`);
    else if (m.attendancePct < 70) flag(2, 'Slipping attendance', `${m.attendancePct}% present`);
  }

  if (m.missedAssignments >= 2) flag(3, 'Missing work', `${m.missedAssignments} assignments overdue`);
  else if (m.missedAssignments === 1) flag(1, 'Missing work', '1 assignment overdue');

  if (m.quizzesTaken >= 1) {
    if (m.quizAvg < 40) flag(3, 'Failing quizzes', `${m.quizAvg}% average`);
    else if (m.quizAvg < 60) flag(2, 'Struggling on quizzes', `${m.quizAvg}% average`);
  } else if (m.quizzesAvailable >= 2) {
    flag(2, 'No quizzes attempted', `${m.quizzesAvailable} available`);
  }

  // null = never seen since lastActiveAt was introduced. That's missing data,
  // not evidence of absence, so it contributes nothing rather than a false flag.
  if (m.daysInactive !== null) {
    if (m.daysInactive >= 14) flag(3, 'Inactive', `${m.daysInactive} days since last sign-in`);
    else if (m.daysInactive >= 7) flag(2, 'Going quiet', `${m.daysInactive} days since last sign-in`);
  }

  if (m.lessonTotal >= 5 && m.lessonPct < 25) flag(2, 'Course barely started', `${m.lessonPct}% of lessons done`);

  return { score, level: score >= 6 ? 'high' : score >= 3 ? 'medium' : 'ok', reasons };
}

// GET /api/lms/stats/at-risk?batchId=..
// Students showing signs of falling behind, worst first. Defaults to every batch
// the caller teaches (admins get all of them). One row per student-per-batch,
// since a student can be on track in one cohort and struggling in another.
router.get('/at-risk', requireAuth, requireRole('mentor', 'admin'), async (req, res) => {
  const { batchId } = req.query;
  // Guard the cast: a malformed id would otherwise throw and surface as a 500.
  if (batchId && !mongoose.isValidObjectId(batchId)) return res.status(400).json({ error: 'Invalid batchId.' });
  if (batchId && !(await isMentorOfBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const batchIds = batchId ? [batchId] : await myBatchIds(req.user);

  const batches = await Batch.find({ _id: { $in: batchIds } }).select('name studentIds programId');
  const studentIds = [...new Set(batches.flatMap((b) => b.studentIds.map(String)))];
  if (studentIds.length === 0) return res.json({ students: [], scanned: 0 });

  const programIds = [...new Set(batches.map((b) => b.programId).filter(Boolean).map(String))];

  // Fetch every signal in two batched rounds, then score in memory. Per-student
  // queries would be N+1 and get slow the moment a cohort grows.
  const [users, attendance, assignments, quizzes, programs, progress] = await Promise.all([
    User.find({ _id: { $in: studentIds } }).select('fullName email lastActiveAt'),
    Attendance.find({ batchId: { $in: batchIds }, studentId: { $in: studentIds } }).select('studentId batchId status'),
    Assignment.find({ batchId: { $in: batchIds } }).select('batchId dueDate'),
    Quiz.find({ batchId: { $in: batchIds } }).select('batchId'),
    Program.find({ _id: { $in: programIds } }).select('modules'),
    Progress.find({ studentId: { $in: studentIds }, programId: { $in: programIds } }).select('studentId programId completedTopics'),
  ]);

  const [submissions, attempts] = await Promise.all([
    Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) }, studentId: { $in: studentIds } }).select('assignmentId studentId'),
    QuizAttempt.find({ quizId: { $in: quizzes.map((q) => q._id) }, studentId: { $in: studentIds } }).select('quizId studentId score total'),
  ]);

  // ── Lookup tables ──
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const submitted = new Set(submissions.map((s) => `${s.assignmentId}:${s.studentId}`));
  const batchOfQuiz = new Map(quizzes.map((q) => [q._id.toString(), q.batchId.toString()]));

  const lessonTotals = new Map(programs.map((p) => [
    p._id.toString(),
    (p.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0),
  ]));

  const attByKey = new Map();
  for (const a of attendance) {
    if (!a.batchId) continue;
    const k = key(a.studentId, a.batchId);
    const v = attByKey.get(k) || { present: 0, total: 0 };
    v.total += 1;
    if (a.status === 'present') v.present += 1;
    attByKey.set(k, v);
  }

  const attemptsByKey = new Map();
  for (const a of attempts) {
    const bid = batchOfQuiz.get(a.quizId.toString());
    if (!bid) continue;
    const k = key(a.studentId, bid);
    attemptsByKey.set(k, [...(attemptsByKey.get(k) || []), a]);
  }

  const progressByKey = new Map(progress.map((p) => [key(p.studentId, p.programId), (p.completedTopics || []).length]));

  // ── Score every student in every batch ──
  const now = Date.now();
  const rows = [];

  for (const b of batches) {
    const bid = b._id.toString();
    const pid = b.programId ? b.programId.toString() : null;
    const overdue = assignments.filter((a) => a.batchId.toString() === bid && a.dueDate && new Date(a.dueDate).getTime() < now);
    const quizzesAvailable = quizzes.filter((q) => q.batchId.toString() === bid).length;
    const lessonTotal = (pid && lessonTotals.get(pid)) || 0;

    for (const sid of b.studentIds.map(String)) {
      const u = userById.get(sid);
      if (!u) continue;

      const att = attByKey.get(key(sid, bid)) || { present: 0, total: 0 };
      const myAttempts = attemptsByKey.get(key(sid, bid)) || [];
      const doneLessons = (pid && progressByKey.get(key(sid, pid))) || 0;

      const metrics = {
        attendancePct: att.total ? Math.round((att.present / att.total) * 100) : 0,
        attendanceTotal: att.total,
        missedAssignments: overdue.filter((a) => !submitted.has(`${a._id}:${sid}`)).length,
        quizAvg: myAttempts.length
          ? Math.round(myAttempts.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / myAttempts.length)
          : 0,
        quizzesTaken: myAttempts.length,
        quizzesAvailable,
        lessonPct: lessonTotal ? Math.round((Math.min(doneLessons, lessonTotal) / lessonTotal) * 100) : 0,
        lessonTotal,
        daysInactive: u.lastActiveAt ? Math.floor((now - u.lastActiveAt.getTime()) / DAY) : null,
      };

      const { score, level, reasons } = assess(metrics);
      if (level === 'ok') continue;

      rows.push({
        id: sid,
        name: u.fullName || u.email,
        email: u.email,
        batch: { id: bid, name: b.name.replace(/^Demo[^A-Za-z0-9]+/, '') },
        level,
        score,
        reasons,
        metrics,
      });
    }
  }

  rows.sort((a, b) => b.score - a.score);
  res.json({ students: rows, scanned: studentIds.length });
});

export default router;
