// Give every existing student membership a join date, so the class review gate
// stops asking about classes held before the student was in the batch.
//
// Join dates are stamped when a student is added from now on
// (utils/enrollment.js). Memberships made before that have none, and fall back
// to the account's creation, which is the bug: an account made on the Students
// page and enrolled a week later owes every class in that week.
//
// The real enrolment date was never stored, so this reads the closest record
// there is. The attendance sweep writes a row for every student enrolled when
// a class closes, and none for anyone added later. So the first class in the
// batch that has an attendance row for the student is the first class they
// were enrolled for, and its start becomes the join date. A student with no
// attendance row in the batch joined after the last class was swept, and is
// stamped with today. Either way the date is never earlier than the account.
//
//   node scripts/backfillBatchJoins.js                       # dry run
//   CONFIRM_DB=menler node scripts/backfillBatchJoins.js --apply
//
// Idempotent: a membership that already has a join date is never touched, so
// a second run finds nothing to do. It writes no review and deletes none.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { Session } from '../models/Session.js';
import { Attendance } from '../models/Attendance.js';
import { ClassReview } from '../models/ClassReview.js';
import { sessionEnd } from '../utils/sessionTime.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  await connectDb();
  const dbName = mongoose.connection.name;
  if (APPLY && (process.env.CONFIRM_DB || '').trim() !== dbName) {
    console.error(`\n✗ Connected to "${dbName}" but CONFIRM_DB is "${process.env.CONFIRM_DB || ''}". Set CONFIRM_DB=${dbName} to apply.\n`);
    process.exit(1);
  }

  const now = new Date();
  const batches = await Batch.find().select('name studentIds').lean();
  const plan = [];

  for (const b of batches) {
    const ids = (b.studentIds || []).map(String);
    if (!ids.length) continue;
    const [users, sessions] = await Promise.all([
      User.find({ _id: { $in: ids } }).select('email createdAt batchJoins').lean(),
      Session.find({ batchId: b._id, startsAt: { $lt: now } }).select('startsAt endsAt durationMins').sort({ startsAt: 1 }).lean(),
    ]);
    const startOf = new Map(sessions.map((s) => [String(s._id), s.startsAt]));
    const marks = await Attendance.find({ batchId: b._id, studentId: { $in: ids } }).select('sessionId studentId').lean();
    const firstMarked = new Map();
    for (const m of marks) {
      const at = startOf.get(String(m.sessionId));
      if (!at) continue;
      const k = String(m.studentId);
      if (!firstMarked.has(k) || at < firstMarked.get(k)) firstMarked.set(k, at);
    }
    const over = sessions.filter((s) => sessionEnd(s) <= now.getTime());

    for (const u of users) {
      if ((u.batchJoins || []).some((j) => String(j.batchId) === String(b._id))) continue;
      const created = u.createdAt ? new Date(u.createdAt) : new Date(0);
      const marked = firstMarked.get(String(u._id));
      let at = marked ? new Date(marked) : now;
      if (at < created) at = created;

      // What the gate asks for today, against what it will ask for after.
      const reviewed = new Set(
        (await ClassReview.find({ studentId: u._id, sessionId: { $in: over.map((s) => s._id) } }).select('sessionId').lean())
          .map((r) => String(r.sessionId)),
      );
      const owedBefore = over.filter((s) => s.startsAt >= created && !reviewed.has(String(s._id))).length;
      const owedAfter = over.filter((s) => s.startsAt >= at && !reviewed.has(String(s._id))).length;
      plan.push({ batch: b, user: u, at, source: marked ? 'first attendance' : 'today', owedBefore, owedAfter });
    }
  }

  console.log(`\n${dbName}: ${plan.length} student membership(s) without a join date`);
  if (!plan.length) {
    console.log('  Nothing to do.\n');
    await mongoose.disconnect();
    return;
  }
  const w = Math.max(...plan.map((r) => r.user.email.length));
  let cleared = 0;
  for (const r of plan) {
    cleared += r.owedBefore - r.owedAfter;
    const change = r.owedBefore === r.owedAfter ? `owes ${r.owedAfter}` : `owes ${r.owedBefore} → ${r.owedAfter}`;
    console.log(`  ${r.batch.name.padEnd(28).slice(0, 28)} ${r.user.email.padEnd(w)}  joined ${r.at.toISOString().slice(0, 16)} (${r.source})  ${change}`);
  }
  console.log(`\n  ${cleared} review form(s) for classes before enrolment would stop being asked.`);

  if (!APPLY) {
    console.log(`  Dry run. Re-run with:  CONFIRM_DB=${dbName} node scripts/backfillBatchJoins.js --apply\n`);
  } else {
    let n = 0;
    for (const r of plan) {
      // Filtered on there still being no row, so an enrolment made while this
      // ran keeps the date it was stamped with.
      const res = await User.updateOne(
        { _id: r.user._id, 'batchJoins.batchId': { $ne: r.batch._id } },
        { $push: { batchJoins: { batchId: r.batch._id, at: r.at } } },
      );
      n += res.modifiedCount;
    }
    console.log(`  ✓ Stamped ${n} membership(s).\n`);
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
