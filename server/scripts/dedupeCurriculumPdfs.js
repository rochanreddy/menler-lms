// Collapse duplicate curriculum PDFs down to one row per distinct file.
//
// Every drop in the curriculum editor used to mint a new FileAsset, so the same
// week-one ebook ended up stored nineteen times — about 20 MB of identical
// bytes. Uploads now reuse a matching row (see routes/uploads.js); this clears
// up what was written before that.
//
// Order matters: the curriculum points at these ids, so the references are
// repointed at the survivor BEFORE anything is deleted. A run that dies halfway
// leaves extra copies, never a lesson pointing at a PDF that is gone.
//
//   node scripts/dedupeCurriculumPdfs.js                  # dry run, changes nothing
//   CONFIRM_DB=menler node scripts/dedupeCurriculumPdfs.js --apply
import 'dotenv/config';
import { createHash } from 'crypto';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { FileAsset } from '../models/FileAsset.js';
import { Program } from '../models/Program.js';
import { User } from '../models/User.js';

const APPLY = process.argv.includes('--apply');
const MEDIA = ['readingUrl', 'notesUrl', 'contentUrl'];

async function run() {
  await connectDb();
  const dbName = mongoose.connection.name;
  if (APPLY && process.env.CONFIRM_DB !== dbName) {
    console.error(`\n✗ Connected to "${dbName}" but CONFIRM_DB is "${process.env.CONFIRM_DB || ''}". Set CONFIRM_DB=${dbName} to apply.\n`);
    process.exit(1);
  }
  console.log(`\n─── curriculum PDF dedupe on "${dbName}" ${APPLY ? '(APPLYING)' : '(dry run)'} ───\n`);

  // Group by content. `data` is select:false, so ask for it explicitly.
  const assets = await FileAsset.find({ kind: 'curriculum-pdf' }).select('+data').sort({ createdAt: 1 });
  const groups = new Map();
  for (const a of assets) {
    const hash = a.hash || createHash('sha256').update(a.data).digest('hex');
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push({ doc: a, hash });
  }

  const remap = new Map(); // dropped id → keeper id
  let freed = 0;
  for (const [hash, rows] of groups) {
    const [keep, ...drop] = rows; // oldest first, so the id already in use wins
    console.log(`  ${keep.doc.name.padEnd(38)} ${(keep.doc.size / 1024).toFixed(0).padStart(5)} KB · keep ${keep.doc._id}${drop.length ? ` · drop ${drop.length}` : ''}`);
    if (APPLY && !keep.doc.hash) { keep.doc.hash = hash; await keep.doc.save(); }
    for (const d of drop) {
      remap.set(String(d.doc._id), String(keep.doc._id));
      freed += d.doc.size;
    }
  }

  // Repoint the curriculum at the survivors before deleting anything.
  let rewritten = 0;
  for (const p of await Program.find({})) {
    let touched = false;
    for (const m of p.modules || []) {
      for (const ch of m.chapters || []) {
        for (const t of ch.topics || []) {
          for (const f of MEDIA) {
            const id = /^\/uploads\/([a-f0-9]{24})$/.exec(t[f] || '')?.[1];
            const to = id && remap.get(id);
            if (!to) continue;
            t[f] = `/uploads/${to}`;
            touched = true;
            rewritten++;
          }
        }
      }
    }
    if (touched) {
      console.log(`  ${p.title}: ${rewritten} lesson reference(s) repointed`);
      if (APPLY) { p.markModified('modules'); await p.save(); }
    }
  }

  // Resume links live on the user, and are never curriculum PDFs — but check,
  // rather than assume, before deleting the rows they might point at.
  const stillUsed = await User.countDocuments({ resumeUrl: { $in: [...remap.keys()].map((id) => `/uploads/${id}`) } });
  if (stillUsed) throw new Error(`${stillUsed} resumeUrl(s) point at a row about to be dropped — aborting.`);

  const ids = [...remap.keys()].map((id) => new mongoose.Types.ObjectId(id));
  if (APPLY && ids.length) await FileAsset.deleteMany({ _id: { $in: ids } });

  console.log(`\n  ${assets.length} rows → ${groups.size} distinct file(s)`);
  console.log(`  ${ids.length} duplicate(s) ${APPLY ? 'deleted' : 'would be deleted'}, ${(freed / 1048576).toFixed(1)} MB ${APPLY ? 'freed' : 'recoverable'}`);
  console.log(`  ${rewritten} lesson reference(s) ${APPLY ? 'repointed' : 'would be repointed'}`);
  if (!APPLY) console.log(`\n  Dry run. Re-run with:  CONFIRM_DB=${dbName} node scripts/dedupeCurriculumPdfs.js --apply`);
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => { console.error('dedupe failed:', err); process.exit(1); });
