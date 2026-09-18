// Does the automated review agree with the mentors?
//
//   node scripts/calibrate.mjs                    # every reviewed + graded submission
//   node scripts/calibrate.mjs "AI Kickstarter"   # one programme
//
// Read-only. It writes nothing and needs no API key.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// The six criteria and the five weightings in utils/rubric.js were derived from
// reading the two curricula. That is a considered guess, not a measurement, and
// until it is checked against real mentors grading real work, nobody knows
// whether a 72 from the rubric means what a mentor's 7/10 means.
//
// Every submission already carries both numbers: the mentor's own `score` and
// the review's `aiReview.final.weighted_score`, side by side on one document,
// and nothing was comparing them. This does.
//
// ── What to do with the output ──────────────────────────────────────────────
// BIAS is the number that matters. A consistent +8 says the rubric is soft and
// the fix is the thresholds or the weights, not the prompt. A near-zero bias
// with a large spread says the rubric is right on average and unreliable
// case by case, which is a prompt problem. A bias that differs sharply BY CLASS
// says that class's weighting is wrong, which is a one-line fix in rubric.js.
//
// Thirty graded submissions is roughly where these numbers stop moving around.
// Below ten, read the worst-disagreement list and ignore the averages.

import 'dotenv/config';
import { connectDb } from '../db.js';
import { Submission } from '../models/Submission.js';
import { Assignment } from '../models/Assignment.js';
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';
import { CLASSES } from '../utils/rubric.js';
import { titleQuery } from '../utils/programmes.js';

const ONLY = process.argv.slice(2).find((x) => !x.startsWith('--')) || '';

// The mentor grades out of 10; the rubric scores out of 100. The AI panel's
// "Fill grade form" button maps one to the other by dividing by 10 and
// rounding, so that same mapping is what has to be compared — anything else
// would measure a conversion nobody uses.
const toMentorScale = (pct) => Math.min(10, Math.max(1, Math.round(pct / 10)));

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fixed = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '-');

function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

async function run() {
  await connectDb();

  let assignmentFilter = {};
  if (ONLY) {
    const program = await Program.findOne(titleQuery(ONLY));
    if (!program) throw new Error(`No programme called "${ONLY}".`);
    const batches = await Batch.find({ programId: program._id }).select('_id');
    const assignments = await Assignment.find({ batchId: { $in: batches.map((b) => b._id) } }).select('_id');
    assignmentFilter = { assignmentId: { $in: assignments.map((a) => a._id) } };
    console.log(`\nScoped to ${program.title}.`);
  }

  // Both numbers have to be present: a submission the mentor graded without
  // running the review, or reviewed and never graded, says nothing about
  // agreement and must not be counted as a zero.
  const subs = await Submission.find({
    ...assignmentFilter,
    isDeleted: false,
    score: { $ne: null },
    'aiReview.status': 'done',
  }).populate('assignmentId', 'title rubricClass type').limit(2000);

  const rows = subs
    .map((s) => {
      const ai = s.aiReview?.final?.weighted_score;
      if (typeof ai !== 'number' || typeof s.score !== 'number') return null;
      const aiOn10 = toMentorScale(ai);
      return {
        title: s.assignmentId?.title || '(unknown assignment)',
        cls: s.aiReview?.final?.rubric_class || s.assignmentId?.rubricClass || '?',
        mentor: s.score,
        ai: aiOn10,
        aiPct: ai,
        delta: aiOn10 - s.score,          // positive = the AI was more generous
        credited: (s.aiReview?.final?.credited || []).length,
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    console.log('\nNothing to compare yet: no submission has both a mentor grade and a finished AI review.');
    console.log('Run some reviews, let mentors grade them, then come back.');
    process.exit(0);
  }

  const deltas = rows.map((r) => r.delta);
  const bias = mean(deltas);
  const mae = mean(deltas.map(Math.abs));
  const within1 = rows.filter((r) => Math.abs(r.delta) <= 1).length;

  console.log(`\n═══ ${rows.length} submission(s) graded by both\n`);
  console.log(`  BIAS               ${bias > 0 ? '+' : ''}${fixed(bias)}  (AI minus mentor, on the 1-10 scale)`);
  console.log(`  average error      ${fixed(mae)} points`);
  console.log(`  spread             ${fixed(stdev(deltas))}`);
  console.log(`  within 1 point     ${within1}/${rows.length}  (${Math.round((within1 / rows.length) * 100)}%)`);
  console.log(`  mentor average     ${fixed(mean(rows.map((r) => r.mentor)), 1)}/10`);
  console.log(`  AI average         ${fixed(mean(rows.map((r) => r.ai)), 1)}/10   (${fixed(mean(rows.map((r) => r.aiPct)), 0)}/100)`);

  if (rows.length < 10) {
    console.log('\n  ! Under ten paired submissions. Read the disagreements below and ignore the averages above.');
  }

  // Per class: this is the actionable cut, because a class IS a weighting.
  console.log('\n─ By rubric class (a class is a weighting, so a bias here is a weighting to fix)');
  console.log('  class            n   bias   avg err');
  for (const key of Object.keys(CLASSES)) {
    const inClass = rows.filter((r) => r.cls === key);
    if (!inClass.length) continue;
    const d = inClass.map((r) => r.delta);
    const b = mean(d);
    console.log(`  ${key} ${CLASSES[key].name.padEnd(10)} ${String(inClass.length).padStart(4)}  ${(b > 0 ? '+' : '') + fixed(b, 1)}`.padEnd(38) + fixed(mean(d.map(Math.abs)), 1));
  }

  // Per assignment, worst first: a single assignment that disagrees badly is
  // usually a bad deliverables checklist rather than a bad rubric.
  const byTitle = new Map();
  for (const r of rows) {
    if (!byTitle.has(r.title)) byTitle.set(r.title, []);
    byTitle.get(r.title).push(r.delta);
  }
  const worstAssignments = [...byTitle.entries()]
    .filter(([, d]) => d.length >= 2)
    .map(([title, d]) => ({ title, n: d.length, bias: mean(d) }))
    .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))
    .slice(0, 8);

  if (worstAssignments.length) {
    console.log('\n─ Assignments that disagree most (2+ graded; check the deliverables list first)');
    for (const a of worstAssignments) {
      console.log(`  ${((a.bias > 0 ? '+' : '') + fixed(a.bias, 1)).padStart(6)}  n=${String(a.n).padEnd(3)} ${a.title.slice(0, 60)}`);
    }
  }

  console.log('\n─ Single worst disagreements (open these and see who was right)');
  for (const r of [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10)) {
    const flagCredited = r.credited ? '  [had credited criteria]' : '';
    console.log(`  mentor ${r.mentor}  AI ${r.ai}  (${r.delta > 0 ? '+' : ''}${r.delta})  ${r.cls}  ${r.title.slice(0, 48)}${flagCredited}`);
  }

  console.log(`
─ Reading this
  bias  > +1   the rubric is too generous. Look at the class breakdown before
               touching the prompt: one soft weighting can carry the average.
  bias  < -1   too harsh. Usually C1, when a deliverables checklist asks for
               something the brief never really did.
  |bias| small but spread large
               right on average, unreliable case by case. That is a prompt
               problem, not a weights problem.
  a class out of line with the rest
               that class's weighting in utils/rubric.js is wrong. One line.
`);
  process.exit(0);
}

run().catch((err) => { console.error('Calibration failed:', err.message); process.exit(1); });
