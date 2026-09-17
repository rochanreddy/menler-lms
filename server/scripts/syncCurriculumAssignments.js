// Put a curriculum's assignments and projects into the Assignments & Projects
// tab.
//
//   node scripts/syncCurriculumAssignments.js                  # dry run, all programmes
//   node scripts/syncCurriculumAssignments.js Kickstarter      # dry run, one programme
//   CONFIRM_DB=<db> node scripts/syncCurriculumAssignments.js --apply
//
// The curriculum describes the work a student has to hand in, but only as
// reading. A student sees it in Learning and then finds nothing to submit,
// because the tab is built from Assignment documents, which are per BATCH and
// nobody had created.
//
// So this reads the authored tree and upserts one Assignment per batch per
// piece of work. It is matched on (batchId, title), so running it twice
// changes nothing and running it after a curriculum edit refreshes the brief.
//
// ── The two programmes keep their work in different places ──────────────────
// Generalist has a chapter per piece: "Weekly Assignment: …" and "Milestone
// Project 1 · …", each with its brief as the chapter's page. Kickstarter has
// an "Assignment: …" LESSON inside every session topic, and its four portfolio
// projects in a module of their own at the end. Hence one extractor each,
// rather than one clever rule that fits neither.
//
// ── On dates ────────────────────────────────────────────────────────────────
// It sets none. The curriculum says an assignment belongs to week 3; it does
// not say when week 3 falls for a batch that started in July, and guessing
// would mark work overdue the moment this ran. Null start means "open now",
// null due means "no cutoff", so everything lands as open work and a mentor
// sets real deadlines in the UI. Once set, this script leaves them alone — it
// only ever rewrites the brief and the grouping.
import 'dotenv/config';
import { connectDb } from '../db.js';
import { assertSeedTarget } from './seedGuard.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { Assignment } from '../models/Assignment.js';
import { PROGRAMME_TITLES, titleQuery } from '../utils/programmes.js';

const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.slice(2).find((x) => !x.startsWith('--')) || '';

// Join a chapter's or a lesson's parts into the one description the tab shows.
const headed = (pairs) => pairs
  .filter(([, body]) => body && String(body).trim())
  .map(([h, body]) => `## ${h}\n\n${String(body).trim()}`)
  .join('\n\n');

// ── Generalist ──────────────────────────────────────────────────────────────
// A chapter is a piece of work if its title says so. The brief is the
// chapter's page and how to hand it in is the lesson under it; the tab shows
// one description, so it gets both, in that order.
function generalistItems(program) {
  const out = [];
  for (const m of program.modules || []) {
    const week = Number((m.title.match(/^WEEK\s+(\d+)/i) || [])[1]) || null;
    for (const c of m.chapters || []) {
      const isWeekly = /^Weekly Assignment:/i.test(c.title);
      const isMilestone = /^Milestone Project\s*\d+\s*·/i.test(c.title);
      if (!isWeekly && !isMilestone) continue;
      out.push({
        type: isMilestone ? 'project' : 'assignment',
        title: c.title,
        description: [c.description?.trim(), headed((c.topics || []).map((t) => [t.title, t.body]))]
          .filter(Boolean).join('\n\n'),
        week,
        groupLabel: week ? `Week ${week}` : '',
      });
    }
  }
  return out;
}

// ── Kickstarter ─────────────────────────────────────────────────────────────
// Both live as LESSONS inside a session topic: "Assignment: …" for the work
// set that hour, and "P01 · …" for the portfolio project that hour introduces.
// The projects used to sit in a module of their own as well, which is why the
// same four appeared twice; they are now only here, carrying the full brief.
function kickstarterItems(program) {
  const out = [];
  for (const m of program.modules || []) {
    const session = Number((m.title.match(/^S(\d+)/i) || [])[1]) || null;
    if (!session) continue;
    for (const c of m.chapters || []) {
      for (const t of c.topics || []) {
        const isProject = /^P\d+\s*·/.test(t.title);
        if (!isProject && !/^Assignment:/i.test(t.title)) continue;
        out.push({
          type: isProject ? 'project' : 'assignment',
          title: t.title,
          description: t.body || '',
          // Projects group after every session, which is how a portfolio
          // reads: the four things you finish the course holding.
          week: isProject ? 99 : session,
          groupLabel: isProject ? 'Portfolio projects' : `Session ${String(session).padStart(2, '0')}`,
        });
      }
    }
  }
  return out;
}

const PROGRAMS = [
  { title: PROGRAMME_TITLES.generalist, build: generalistItems },
  { title: PROGRAMME_TITLES.kickstarter, build: kickstarterItems },
];

async function syncProgram({ title, build }) {
  const tally = { created: 0, updated: 0, unchanged: 0 };
  const program = await Program.findOne(titleQuery(title));
  if (!program) { console.log(`\n${title}: no such programme, skipped.`); return tally; }
  const items = build(program);
  const batches = await Batch.find({ programId: program._id });
  console.log(`\n═══ ${title}: ${items.length} pieces of work · ${batches.length} batch(es)`);
  for (const it of items) console.log(`  ${it.type.padEnd(10)} ${it.groupLabel.padEnd(19)} ${it.title.slice(0, 62)}`);
  if (!items.length || !batches.length) return tally;

  for (const b of batches) {
    console.log(`\n─ ${b.name} (${b.studentIds?.length || 0} students)`);
    for (const it of items) {
      const existing = await Assignment.findOne({ batchId: b._id, title: it.title });
      if (!existing) {
        console.log(`   + ${it.type.padEnd(10)} ${it.title.slice(0, 62)}`);
        tally.created++;
        if (APPLY) {
          await Assignment.create({
            batchId: b._id,
            type: it.type,
            title: it.title,
            description: it.description,
            week: it.week,
            groupLabel: it.groupLabel,
            startDate: null,
            dueDate: null,
          });
        }
        continue;
      }
      // Never touch a date, or the type a mentor may have corrected — only the
      // brief and the grouping, which are the things the curriculum owns.
      const same = (existing.description || '') === it.description
        && (existing.week ?? null) === it.week
        && (existing.groupLabel || '') === it.groupLabel;
      if (same) { tally.unchanged++; continue; }
      console.log(`   ~ ${it.type.padEnd(10)} ${it.title.slice(0, 62)}`);
      tally.updated++;
      if (APPLY) {
        existing.description = it.description;
        existing.week = it.week;
        existing.groupLabel = it.groupLabel;
        await existing.save();
      }
    }
  }
  return tally;
}

async function run() {
  await connectDb();
  if (APPLY) {
    assertSeedTarget(
      'syncCurriculumAssignments --apply',
      'It creates or updates Assignment documents for every batch of the programmes it touches.',
    );
  }
  const wanted = PROGRAMS.filter((p) => !ONLY || p.title.toLowerCase() === ONLY.toLowerCase());
  if (!wanted.length) throw new Error(`No programme called "${ONLY}". Try: ${PROGRAMS.map((p) => p.title).join(', ')}`);

  const total = { created: 0, updated: 0, unchanged: 0 };
  for (const p of wanted) {
    const t = await syncProgram(p);
    for (const k of Object.keys(total)) total[k] += t[k];
  }

  console.log(`\n${total.created} to create · ${total.updated} to update · ${total.unchanged} already current`);
  if (!APPLY) console.log('\nDry run. Nothing was written. Re-run with --apply (and CONFIRM_DB) to write.');
  else console.log('\n✅ Written. Everything opens immediately and has no deadline — set those per batch in the UI.');
  process.exit(0);
}

run().catch((err) => { console.error('Sync failed:', err); process.exit(1); });
