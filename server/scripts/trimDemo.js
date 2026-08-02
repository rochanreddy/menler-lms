// One-off cleanup: keep ONE batch (the ongoing 5-student demo cohort) with a
// single mentor; delete every other batch, every other student/mentor account,
// and all their scattered data. Admin + partner accounts are untouched.
// Run:  node scripts/trimDemo.js
import 'dotenv/config';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Attendance } from '../models/Attendance.js';
import { Session } from '../models/Session.js';
import { Announcement } from '../models/Announcement.js';
import { Message } from '../models/Message.js';
import { Doubt } from '../models/Doubt.js';
import { Progress } from '../models/Progress.js';
import { Notification } from '../models/Notification.js';
import { Application } from '../models/Application.js';

async function run() {
  await connectDb();

  // Keeper = the ongoing batch with the most students (the 5-student demo cohort).
  const batches = await Batch.find().sort({ createdAt: -1 });
  const keep = [...batches].sort((a, b) =>
    (b.status === 'ongoing') - (a.status === 'ongoing') || b.studentIds.length - a.studentIds.length,
  )[0];
  if (!keep) { console.log('No batches found — nothing to trim.'); process.exit(0); }

  const keepMentor = keep.mentorIds[0] || null;
  const keepStudents = keep.studentIds.map(String);
  const keepUserIds = new Set([...keepStudents, ...(keepMentor ? [String(keepMentor)] : [])]);

  console.log(`Keeping batch: "${keep.name}" (${keepStudents.length} students, 1 mentor)`);

  // Trim the kept batch to a single mentor.
  keep.mentorIds = keepMentor ? [keepMentor] : [];
  await keep.save();

  // Delete every other batch + its scoped data.
  const dropBatchIds = batches.filter((b) => String(b._id) !== String(keep._id)).map((b) => b._id);
  const dropAssignments = await Assignment.find({ batchId: { $in: dropBatchIds } }).select('_id');
  const dropQuizzes = await Quiz.find({ batchId: { $in: dropBatchIds } }).select('_id');
  await Promise.all([
    Submission.deleteMany({ assignmentId: { $in: dropAssignments.map((a) => a._id) } }),
    QuizAttempt.deleteMany({ quizId: { $in: dropQuizzes.map((q) => q._id) } }),
    Assignment.deleteMany({ batchId: { $in: dropBatchIds } }),
    Quiz.deleteMany({ batchId: { $in: dropBatchIds } }),
    Session.deleteMany({ batchId: { $in: dropBatchIds } }),
    Attendance.deleteMany({ batchId: { $in: dropBatchIds } }),
    Announcement.deleteMany({ batchId: { $in: dropBatchIds } }),
    Message.deleteMany({ batchId: { $in: dropBatchIds } }),
    Doubt.deleteMany({ batchId: { $in: dropBatchIds } }),
    Batch.deleteMany({ _id: { $in: dropBatchIds } }),
  ]);
  console.log(`✓ Deleted ${dropBatchIds.length} other batch(es) and their content`);

  // Delete every student/mentor account not in the kept batch, plus their data.
  const dropUsers = await User.find({ role: { $in: ['student', 'mentor'] }, _id: { $nin: [...keepUserIds] } }).select('_id email role');
  const dropUserIds = dropUsers.map((u) => u._id);
  await Promise.all([
    Submission.deleteMany({ studentId: { $in: dropUserIds } }),
    QuizAttempt.deleteMany({ studentId: { $in: dropUserIds } }),
    Attendance.deleteMany({ studentId: { $in: dropUserIds } }),
    Progress.deleteMany({ studentId: { $in: dropUserIds } }),
    Notification.deleteMany({ userId: { $in: dropUserIds } }),
    Application.deleteMany({ studentId: { $in: dropUserIds } }),
    Message.deleteMany({ authorId: { $in: dropUserIds } }),
    Doubt.deleteMany({ authorId: { $in: dropUserIds } }),
    User.deleteMany({ _id: { $in: dropUserIds } }),
  ]);
  console.log(`✓ Deleted ${dropUsers.length} user(s): ${dropUsers.map((u) => `${u.email} (${u.role})`).join(', ') || 'none'}`);

  // Kept users belong to exactly the kept batch.
  await User.updateMany({ _id: { $in: [...keepUserIds] } }, { $set: { batchIds: [keep._id] } });

  const [students, mentors, nBatches] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'mentor' }),
    Batch.countDocuments(),
  ]);
  const mentorDoc = keepMentor ? await User.findById(keepMentor).select('email') : null;
  const studentDocs = await User.find({ role: 'student' }).select('email');
  console.log(`\nFinal state: ${nBatches} batch, ${students} students, ${mentors} mentor`);
  console.log(`Mentor: ${mentorDoc?.email || '(none)'}`);
  console.log(`Students: ${studentDocs.map((s) => s.email).join(', ')}`);
  process.exit(0);
}

run().catch((err) => { console.error('Trim failed:', err); process.exit(1); });
