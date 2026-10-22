// Open a month's cohorts: one batch per programme, named the way the existing
// ones are ("AI Kickstarter · Nov 2026"), with the programme's mentors carried
// over from its newest batch and the curriculum's assignments and projects put
// on the new batch's Assignments & Projects tab — the three things that
// otherwise take three screens and a script to do by hand for every intake.
//
//   node scripts/createBatches.js "Nov 2026"                       # dry run, both programmes
//   node scripts/createBatches.js "Nov 2026" Kickstarter           # one programme
//   node scripts/createBatches.js "Nov 2026" --start=2026-11-02 --end=2027-02-07
//   node scripts/createBatches.js "Nov 2026" --mentors=none        # leave mentors to the UI
//   CONFIRM_DB=<db> node scripts/createBatches.js "Nov 2026" --apply
//
// Idempotent on the name: a batch that already exists under the programme is
// left exactly as it is (its dates may have been edited in the UI since), and
// only the two things that are safe to repeat run again — mentors are added if
// it has none, and the assignment sync, which is itself idempotent.
//
// ── Dates ───────────────────────────────────────────────────────────────────
// The label names the month, so the default start is the first of that month
// and the end is 14 weeks later, which is the span the September cohorts were
// given (2026-09-01 → 2026-12-08). Both are guesses an admin corrects on the
// Batches page the moment the real calendar is known; --start/--end set them
// here. The status follows the start: ahead of today it is "upcoming", else
// "ongoing".
//
// ── Mentors ─────────────────────────────────────────────────────────────────
// Copied from the programme's newest batch (by start date), because a new
// intake is nearly always taught by the people teaching the current one, and
// a batch with no mentor is one no mentor can see. Both sides are written —
// Batch.mentorIds and User.batchIds — exactly as POST /batches/:id/mentors
// does. --mentors=none skips it.
//
// ── Students ────────────────────────────────────────────────────────────────
// None. Enrolment is per person, mails credentials, and belongs on the Batches
// page (or POST /batches/:id/students), where the admin types each email.
//
// ── Sessions ────────────────────────────────────────────────────────────────
// None. "Schedule the whole course" on the Sessions page computes the dates in
// the admin's own timezone and takes the Zoom links, which a script cannot.
import 'dotenv/config';
import { connectDb } from '../db.js';
import { assertSeedTarget } from './seedGuard.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { titleQuery } from '../utils/programmes.js';
import { PROGRAMS, syncProgram } from './syncCurriculumAssignments.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const flag = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=');
const positional = args.filter((a) => !a.startsWith('--'));
const LABEL = positional[0] || '';
const ONLY = positional[1] || '';
const MENTORS = (flag('mentors') || 'copy').toLowerCase();

const COURSE_WEEKS = 14;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function usage(msg) {
  console.error(`\n✗ ${msg}\n\n  node scripts/createBatches.js "Nov 2026" [Kickstarter|Generalist] [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--mentors=copy|none] [--apply]\n`);
  process.exit(1);
}

/** "Nov 2026" / "November 2026" / "nov-2026" → the first of that month (UTC), or null. */
function monthStart(label) {
  const m = String(label).trim().match(/^([A-Za-z]+)[\s-]+(\d{4})$/);
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  if (idx < 0) return null;
  return new Date(Date.UTC(Number(m[2]), idx, 1));
}

function parseDate(s, what) {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) usage(`--${what} must be YYYY-MM-DD, got "${s}".`);
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) usage(`--${what} is not a real date: "${s}".`);
  return d;
}

const day = (d) => d.toISOString().slice(0, 10);

function resolveDates() {
  let start = parseDate(flag('start'), 'start') || monthStart(LABEL);
  if (!start) usage(`Could not read a month out of "${LABEL}". Name one like "Nov 2026", or pass --start.`);
  let end = parseDate(flag('end'), 'end');
  if (!end) end = new Date(start.getTime() + COURSE_WEEKS * 7 * 24 * 3600 * 1000);
  if (end <= start) usage(`--end (${day(end)}) must be after the start (${day(start)}).`);
  return { start, end };
}

async function mentorsToCopy(program, exceptId) {
  if (MENTORS === 'none') return [];
  if (MENTORS !== 'copy') usage(`--mentors must be "copy" or "none", got "${MENTORS}".`);
  const source = await Batch.findOne({ programId: program._id, _id: { $ne: exceptId } })
    .sort({ startDate: -1, createdAt: -1 });
  if (!source || !source.mentorIds.length) return [];
  // Only live mentor accounts: a batch can still point at an account that has
  // since been deleted or changed role, and that must not be copied forward.
  const users = await User.find({ _id: { $in: source.mentorIds }, role: 'mentor' }, 'email fullName');
  return { from: source, users };
}

async function openBatch({ title, build }, dates) {
  const program = await Program.findOne(titleQuery(title));
  if (!program) { console.log(`\n═══ ${title}: no such programme, skipped.`); return null; }
  const lessons = (program.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0);
  const name = `${program.title} · ${LABEL}`;
  console.log(`\n═══ ${program.title} (${lessons} lessons)`);

  let batch = await Batch.findOne({ programId: program._id, name });
  const status = dates.start > new Date() ? 'upcoming' : 'ongoing';
  if (batch) {
    console.log(`   = ${name} already exists (${batch.status}, ${day(batch.startDate || dates.start)} → ${day(batch.endDate || dates.end)}, ${batch.mentorIds.length} mentors, ${batch.studentIds.length} students) — left as is`);
  } else {
    console.log(`   + ${name}: ${status}, ${day(dates.start)} → ${day(dates.end)}`);
    if (APPLY) batch = await Batch.create({ programId: program._id, name, startDate: dates.start, endDate: dates.end, status });
  }

  // Mentors: carried over only onto a batch that has none, so a list the
  // admin has already trimmed on the Batches page is never refilled.
  if (!batch || !batch.mentorIds.length) {
    const copy = await mentorsToCopy(program, batch?._id);
    if (!copy || !copy.users?.length) {
      console.log(`   · mentors: none to copy${MENTORS === 'none' ? ' (--mentors=none)' : ' — assign them on the Batches page'}`);
    } else {
      console.log(`   · mentors from "${copy.from.name}": ${copy.users.map((u) => u.email).join(', ')}`);
      if (APPLY && batch) {
        const ids = copy.users.map((u) => u._id);
        await Batch.findByIdAndUpdate(batch._id, { $addToSet: { mentorIds: { $each: ids } } });
        await User.updateMany({ _id: { $in: ids } }, { $addToSet: { batchIds: batch._id } });
      }
    }
  }

  // The curriculum's work, onto this batch's Assignments & Projects tab. On a
  // dry run there is no batch yet, so the sync has nothing to count against;
  // the full list prints with the --apply run and in syncCurriculumAssignments
  // on its own.
  if (batch) {
    const t = await syncProgram({ title, build }, { apply: APPLY, batchIds: [batch._id], verbose: false });
    console.log(`   · assignments & projects: ${t.created} to create · ${t.updated} to update · ${t.unchanged} already current`);
  } else {
    const items = build(program);
    const n = (type) => items.filter((it) => it.type === type).length;
    console.log(`   · assignments & projects: ${n('assignment')} assignments · ${n('project')} projects go on with --apply`);
  }
  return name;
}

async function run() {
  if (!LABEL) usage('Name the intake, e.g. "Nov 2026".');
  const dates = resolveDates();
  const wanted = PROGRAMS.filter((p) => !ONLY || p.title.toLowerCase().includes(ONLY.toLowerCase()));
  if (!wanted.length) usage(`No programme called "${ONLY}". Try: ${PROGRAMS.map((p) => p.title).join(', ')}`);

  await connectDb();
  if (APPLY) {
    assertSeedTarget('createBatches --apply', 'It creates batches, assigns mentors to them and writes their Assignment rows.');
  }

  console.log(`\nIntake "${LABEL}": ${day(dates.start)} → ${day(dates.end)} (${COURSE_WEEKS} weeks)${flag('start') || flag('end') ? '' : ' — defaults; edit on the Batches page once the calendar is fixed'}`);
  for (const p of wanted) await openBatch(p, dates);

  if (!APPLY) console.log('\nDry run. Nothing was written. Re-run with --apply (and CONFIRM_DB) to write.');
  else console.log('\n✅ Done. Next, on the admin side: enrol the students on the Batches page, then "Schedule the whole course" on Sessions with the Zoom links, then set assignment dates if the cohort runs on deadlines.');
  process.exit(0);
}

run().catch((err) => { console.error('createBatches failed:', err); process.exit(1); });
