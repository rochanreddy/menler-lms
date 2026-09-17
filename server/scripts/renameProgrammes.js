// Rename the programmes and their batches to the branded titles: "Kickstarter"
// becomes "AI Kickstarter", "Generalist" becomes "AI Generalist", and a batch
// named "Kickstarter · Sept 2026" becomes "AI Kickstarter · Sept 2026".
//
// The name is data, so this is how the UI changes everywhere at once: every
// screen prints Program.title and Batch.name. Issued certificates keep the
// title they were issued with — a certificate is a record of what it said.
//
//   node scripts/renameProgrammes.js                       # dry run
//   CONFIRM_DB=menler node scripts/renameProgrammes.js --apply
//
// Idempotent: a title that already starts with "AI " is left alone, so
// running it twice changes nothing the second time.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { brandedTitle } from '../utils/programmes.js';

const APPLY = process.argv.includes('--apply');
// Only these two are renamed; a programme called anything else is not ours
// to guess at.
const BARE = /^(Kickstarter|Generalist)\b/;

async function main() {
  await connectDb();
  const dbName = mongoose.connection.name;
  if (APPLY && (process.env.CONFIRM_DB || '').trim() !== dbName) {
    console.error(`\n✗ Connected to "${dbName}" but CONFIRM_DB is "${process.env.CONFIRM_DB || ''}". Set CONFIRM_DB=${dbName} to apply.\n`);
    process.exit(1);
  }

  const programs = await Program.find().select('title');
  const batches = await Batch.find().select('name');
  const plan = [];
  for (const p of programs) if (BARE.test(p.title)) plan.push({ kind: 'programme', doc: p, field: 'title', from: p.title, to: brandedTitle(p.title) });
  for (const b of batches) if (BARE.test(b.name)) plan.push({ kind: 'batch', doc: b, field: 'name', from: b.name, to: `AI ${b.name}` });

  console.log(`\n${dbName}: ${programs.length} programme(s), ${batches.length} batch(es)`);
  if (!plan.length) {
    console.log('  Nothing to rename — every title already reads "AI …".\n');
  } else {
    for (const r of plan) console.log(`  ${r.kind.padEnd(9)} "${r.from}"  →  "${r.to}"`);
  }

  if (!APPLY) {
    if (plan.length) console.log(`\n  Dry run. Re-run with:  CONFIRM_DB=${dbName} node scripts/renameProgrammes.js --apply\n`);
  } else {
    for (const r of plan) {
      r.doc[r.field] = r.to;
      await r.doc.save();
    }
    console.log(`\n  ✓ Renamed ${plan.length} row(s).\n`);
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
