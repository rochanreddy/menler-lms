// Put the Generalist curriculum's assignments and projects into the
// Assignments & Projects tab.
//
//   node scripts/syncCurriculumAssignments.js            # dry run, writes nothing
//   CONFIRM_DB=<db> node scripts/syncCurriculumAssignments.js --apply
//
// The curriculum already describes ten pieces of work — six weekly assignments
// and four milestone projects — but only as reading. A student sees them in
// Learning and then finds nothing to hand in, because the tab is built from
// Assignment documents, which are per BATCH and nobody had created.
//
// So this reads the authored tree and upserts one Assignment per batch per
// piece of work. It is matched on (batchId, title), so running it twice
// changes nothing and running it after a curriculum edit refreshes the brief.
//
// ── On dates ────────────────────────────────────────────────────────────────
// It sets none. The curriculum says a weekly assignment belongs to week 3; it
// does not say when week 3 falls for a batch that started in July, and
// guessing would mark work overdue the moment this ran. Null start means "open
// now", null due means "no cutoff", so everything lands as open work and a
// mentor sets real deadlines in the UI. Once set, this script leaves them
// alone — it only ever rewrites the title's description.
import 'dotenv/config';
import { connectDb } from '../db.js';
import { assertSeedTarget } from './seedGuard.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { Assignment } from '../models/Assignment.js';

const PROGRAM = 'Generalist';
const APPLY = process.argv.includes('--apply');

// "Weekly Assignment: My AI Landscape Report" → assignment, "My AI Landscape
// Report". "Milestone Project 1 · My Claude OS" → project, "My Claude OS".
// Anything else in the tree is a session or a week, and not work to hand in.
function classify(chapterTitle) {
  const weekly = chapterTitle.match(/^Weekly Assignment:\s*(.+)$/i);
  if (weekly) return { type: 'assignment', name: weekly[1].trim() };
  const milestone = chapterTitle.match(/^Milestone Project\s*(\d+)\s*·\s*(.+)$/i);
  if (milestone) return { type: 'project', name: milestone[2].trim(), n: Number(milestone[1]) };
  return null;
}

// The brief is the chapter's page; how to hand it in is the lesson under it.
// The tab shows one description, so it gets both, in that order.
function briefOf(chapter) {
  const parts = [];
  if (chapter.description?.trim()) parts.push(chapter.description.trim());
  for (const t of chapter.topics || []) {
    if (!t.body?.trim()) continue;
    parts.push(`## ${t.title}\n\n${t.body.trim()}`);
  }
  return parts.join('\n\n');
}

function itemsFrom(program) {
  const out = [];
  for (const m of program.modules || []) {
    for (const c of m.chapters || []) {
      const kind = classify(c.title);
      if (!kind) continue;
      out.push({
        type: kind.type,
        // The chapter's own title, verbatim. A student reads "Milestone
        // Project 1 · My Claude OS" in the syllabus and must find that exact
        // name in the tab; a tidier one they have to translate is worse.
        title: c.title,
        // What this used to be called, so a rename moves the existing row
        // instead of creating a second one beside it.
        wasTitled: kind.type === 'project' ? `Project ${kind.n}: ${kind.name}` : kind.name,
        description: briefOf(c),
        // "WEEK 3 · THINK + CREATE…" -> 3. The tab groups on this, so the
        // list reads in the order the programme is taught.
        week: Number((m.title.match(/^WEEK\s+(\d+)/i) || [])[1]) || null,
        weekLabel: m.title.split('·')[0].trim(),
      });
    }
  }
  return out;
}

async function run() {
  await connectDb();
  if (APPLY) {
    assertSeedTarget(
      'syncCurriculumAssignments --apply',
      'It creates or updates Assignment documents for every Generalist batch.',
    );
  }

  const program = await Program.findOne({ title: PROGRAM });
  if (!program) throw new Error(`No "${PROGRAM}" programme found.`);
  const items = itemsFrom(program);
  if (!items.length) throw new Error('Found no assignments or projects in the curriculum.');

  const batches = await Batch.find({ programId: program._id });
  console.log(`\n${PROGRAM}: ${items.length} pieces of work in the curriculum, ${batches.length} batch(es).\n`);
  for (const it of items) console.log(`  ${it.type.padEnd(10)} ${it.weekLabel.padEnd(8)} ${it.title}`);

  if (!batches.length) {
    console.log('\nNo batches run this programme, so there is nothing to attach them to.');
    process.exit(0);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const b of batches) {
    console.log(`\n─ ${b.name} (${b.studentIds?.length || 0} students)`);
    for (const it of items) {
      let existing = await Assignment.findOne({ batchId: b._id, title: it.title });
      if (!existing && it.wasTitled) {
        existing = await Assignment.findOne({ batchId: b._id, title: it.wasTitled });
        if (existing) {
          console.log(`   ~ ${it.type.padEnd(10)} ${it.wasTitled}  → renamed to match the syllabus`);
          existing.title = it.title;
          if (APPLY) await existing.save();
        }
      }
      if (!existing) {
        console.log(`   + ${it.type.padEnd(10)} ${it.title}`);
        created++;
        if (APPLY) {
          await Assignment.create({
            batchId: b._id,
            type: it.type,
            title: it.title,
            description: it.description,
            week: it.week,
            startDate: null,
            dueDate: null,
          });
        }
        continue;
      }
      // Never touch a date, or the type a mentor may have corrected — only the
      // brief, which is the thing the curriculum owns.
      const sameBrief = (existing.description || '') === it.description;
      const sameWeek = (existing.week ?? null) === it.week;
      if (sameBrief && sameWeek) { unchanged++; continue; }
      console.log(`   ~ ${it.type.padEnd(10)} ${it.title}  (${[!sameBrief && 'brief', !sameWeek && 'week'].filter(Boolean).join(' + ')} refreshed)`);
      updated++;
      if (APPLY) {
        existing.description = it.description;
        existing.week = it.week;
        await existing.save();
      }
    }
  }

  console.log(`\n${created} to create · ${updated} to update · ${unchanged} already current`);
  if (!APPLY) console.log('\nDry run. Nothing was written. Re-run with --apply (and CONFIRM_DB) to write.');
  else console.log('\n✅ Written. Every assignment opens immediately and has no deadline — set those per batch in the UI.');
  process.exit(0);
}

run().catch((err) => { console.error('Sync failed:', err); process.exit(1); });
