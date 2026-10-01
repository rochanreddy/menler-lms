// Grade the submissions handed in before automatic grading existed.
//
// utils/autoGrade.js only grades a hand-in that carries a submittedAt, which
// every submission made since it shipped has. The ones from before have none,
// so they sat waiting for a mentor. This lists every submission still without
// a grade and, with --apply, puts the ones that passed the Drive check through
// the same grader: same rubric, same floor, same notifications to the student
// and the admins.
//
//   node scripts/gradeBacklog.js                        # dry run: the list
//   CONFIRM_DB=menler node scripts/gradeBacklog.js --apply
//
// Submissions that did not pass the Drive check (NEEDS_FIXES, CHECK_FAILED,
// PENDING_CHECK) are listed and left alone: there is nothing to read until the
// student fixes the folder or a mentor rechecks it. Idempotent: a graded
// submission is never touched again, and a second run finds only what is left.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Submission } from '../models/Submission.js';
import '../models/Assignment.js';
import '../models/Batch.js';
import '../models/User.js';
import { sweepAutoGrades, AUTO_GRADE_DELAY_MS, MAX_ATTEMPTS } from '../utils/autoGrade.js';

const APPLY = process.argv.includes('--apply');
const UNGRADED = { isDeleted: false, status: 'submitted' };

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');

async function main() {
  await connectDb();
  const dbName = mongoose.connection.name;
  if (APPLY && (process.env.CONFIRM_DB || '').trim() !== dbName) {
    console.error(`\n✗ Connected to "${dbName}" but CONFIRM_DB is "${process.env.CONFIRM_DB || ''}". Set CONFIRM_DB=${dbName} to apply.\n`);
    process.exit(1);
  }
  if (APPLY && !process.env.GEMINI_API_KEY) {
    console.error('\n✗ No GEMINI_API_KEY in .env, so nothing can be graded.\n');
    process.exit(1);
  }

  const subs = await Submission.find(UNGRADED)
    .populate({ path: 'assignmentId', select: 'title batchId', populate: { path: 'batchId', select: 'name' } })
    .populate('studentId', 'fullName email')
    .sort({ createdAt: 1 });
  const graded = await Submission.countDocuments({ isDeleted: false, status: 'graded' });

  const ready = subs.filter((s) => s.checkStatus === 'READY' && !s.locked);
  const waiting = subs.filter((s) => !ready.includes(s));

  console.log(`\n${dbName}: ${subs.length} submission(s) without a grade, ${graded} already graded\n`);
  const row = (s) => [
    (s.studentId?.fullName || s.studentId?.email || '?').padEnd(24).slice(0, 24),
    (s.assignmentId?.batchId?.name || '?').padEnd(26).slice(0, 26),
    (s.assignmentId?.title || '?').padEnd(44).slice(0, 44),
    fmt(s.submittedAt || s.updatedAt),
  ].join('  ');

  if (ready.length) {
    console.log(`  Ready to grade (${ready.length}):`);
    for (const s of ready) console.log(`    ${row(s)}${s.aiReview?.attempts >= MAX_ATTEMPTS ? '  (AI gave up before; will retry)' : ''}`);
  }
  if (waiting.length) {
    console.log(`\n  Left alone, the Drive folder has not passed its check (${waiting.length}):`);
    for (const s of waiting) console.log(`    ${row(s)}  ${s.locked ? 'LOCKED' : s.checkStatus || 'NOT CHECKED'}`);
  }

  if (!APPLY) {
    if (ready.length) console.log(`\n  Dry run. To grade the ${ready.length} above:  CONFIRM_DB=${dbName} node scripts/gradeBacklog.js --apply\n`);
    else console.log('');
    await mongoose.disconnect();
    return;
  }

  // Put them in the grader's queue: a submittedAt old enough to be due, and
  // fresh attempts. Filtered on still being ungraded, so a mentor who graded
  // one since the list was read keeps their grade.
  const due = new Date(Date.now() - AUTO_GRADE_DELAY_MS - 60 * 1000);
  for (const s of ready) {
    await Submission.updateOne(
      { _id: s._id, status: 'submitted', locked: false },
      { $set: { submittedAt: s.submittedAt && s.submittedAt < due ? s.submittedAt : due, 'aiReview.attempts': 0 } },
    );
  }

  console.log(`\n  Grading ${ready.length}. Each takes a few seconds to half a minute.`);
  const totals = { graded: 0, failed: 0, skipped: 0 };
  for (;;) {
    const r = await sweepAutoGrades();
    totals.graded += r.graded; totals.failed += r.failed; totals.skipped += r.skipped;
    if (r.paused) { console.log('  Google refused: the daily AI quota is spent. Re-run after 12:30 pm IST.'); break; }
    if (!r.graded && !r.failed && !r.skipped) break;
    console.log(`    … ${totals.graded} graded${totals.failed ? `, ${totals.failed} failed` : ''}`);
  }

  const after = await Submission.find({ _id: { $in: ready.map((s) => s._id) } })
    .populate({ path: 'assignmentId', select: 'title batchId', populate: { path: 'batchId', select: 'name' } })
    .populate('studentId', 'fullName email');
  console.log('');
  for (const s of after) {
    const result = s.status === 'graded' ? `${s.score}/10` : `NOT GRADED: ${s.aiReview?.error || 'try again'}`;
    console.log(`    ${row(s)}  ${result}`);
  }
  console.log(`\n  ${totals.graded} graded, ${after.length - totals.graded} not. Students and admins were notified of each grade.\n`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
