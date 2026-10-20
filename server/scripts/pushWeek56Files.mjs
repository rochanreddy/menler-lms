// Brings AI Generalist Weeks 2-6 on a live database into the shape Weeks 1
// and 2 already have, so every week reads the same way:
//
//   · the week               reading material = the week ebook (W1-3) or the
//                            week's study notes (W4-6). Its teacher-notes slot
//                            is the admin's: a file of ours found there (the
//                            Week 4 notes) is taken out.
//   · Weekly Assignment      on the CHAPTER: the one-page assignment as the
//                            brief, the solution book as the solution
//   · Milestone Project N    on the CHAPTER: the project's own Instructions as
//                            the brief and its Solution as the solution
//                            (W2 -> 1, W3 -> 2, W4 -> 3, W6 -> 4). Milestones 1
//                            and 2 held the weekly assignment's pair, so the
//                            Assignments & Projects tab showed both cards the
//                            same two PDFs.
//   · the Submission lesson  holds nothing of ours: a lesson's own slot wins
//                            over its chapter's, so a copy there shadows the
//                            chapter (that is where the earlier push put them).
//
// A slot holding a file the admin uploaded is never touched; only empty slots
// and slots holding one of the repo's own PDFs are written. Idempotent.
// Same mapping as CURRICULUM_PDF_RULES in utils/curriculumPdfAssets.js.
//
//   node scripts/pushWeek56Files.mjs                          # dry run
//   CONFIRM_DB=<db> node scripts/pushWeek56Files.mjs --apply
import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Program } from '../models/Program.js';
import { User } from '../models/User.js';
import { FileAsset } from '../models/FileAsset.js';
import { ensureCurriculumPdf, sha256 } from '../utils/curriculumPdfAssets.js';
import { titleQuery } from '../utils/programmes.js';

const APPLY = process.argv.includes('--apply');
const DIR = join(dirname(fileURLToPath(import.meta.url)), '../assets/curriculum-pdfs');
const F = 'Menler-Fellowship-';

const WEEKS = {
  2: { work: [
    ['Weekly Assignment', `${F}Week2-Assignment.pdf`, `${F}Week2-Assignment-Solution-Book.pdf`],
    ['Milestone Project 1', `${F}W2-Claude-OS-First-Build-Instructions.pdf`, `${F}W2-Claude-OS-First-Build-Solution.pdf`],
  ] },
  3: { work: [
    ['Weekly Assignment', `${F}Week3-Assignment.pdf`, `${F}Week3-Assignment-Solution-Book.pdf`],
    ['Milestone Project 2', `${F}W3-AI-Media-Kit-Instructions.pdf`, `${F}W3-AI-Media-Kit-Solution.pdf`],
  ] },
  4: { reading: `${F}Week4-Notes.pdf`, work: [
    ['Weekly Assignment', `${F}Week4-Assignment.pdf`, `${F}Week4-Assignment-Solution-Book.pdf`],
    ['Milestone Project 3', `${F}W4-My-Automated-AI-System-Instructions.pdf`, `${F}W4-My-Automated-AI-System-Solution.pdf`],
  ] },
  5: { reading: `${F}Week5-Notes.pdf`, work: [
    ['Weekly Assignment', `${F}Week5-Assignment.pdf`, `${F}Week5-Assignment-Solution-Book.pdf`],
  ] },
  6: { reading: `${F}Week6-Notes.pdf`, work: [
    ['Weekly Assignment', `${F}Week6-Assignment.pdf`, `${F}Week6-Assignment-Solution-Book.pdf`],
    ['Milestone Project 4', `${F}W6-Ship-It-Capstone-Instructions.pdf`, `${F}W6-Ship-It-Capstone-Solution.pdf`],
  ] },
};

await connectDb();
const db = mongoose.connection.name;
if (APPLY && process.env.CONFIRM_DB !== db) {
  console.error(`Connected to "${db}". Set CONFIRM_DB=${db} to write.`);
  process.exit(1);
}
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} on ${db}`);

const admin = await User.findOne({ role: 'admin' }).select('_id');
const p = await Program.findOne(titleQuery('Generalist'));
if (!p) throw new Error('no Generalist programme');

// Every Fellowship PDF the repo ships, by url, so "is this slot ours" is a
// lookup. Read-only: rows found by content hash; a file not stored yet has none.
const ours = new Map(); // url -> filename
const hashUrl = {};
for (const f of readdirSync(DIR).filter((x) => x.startsWith(F))) {
  const row = await FileAsset.findOne({ kind: 'curriculum-pdf', hash: sha256(readFileSync(join(DIR, f))) }).sort({ createdAt: 1 }).select('_id');
  if (row) { hashUrl[f] = `/uploads/${row._id}`; ours.set(hashUrl[f], f); }
}
const short = (u) => (ours.get(u) || u || '').replace(F, '');

// Apply stores (or reuses) the file; a dry run names the one it would upload.
async function urlOf(file) {
  if (hashUrl[file]) return hashUrl[file];
  if (!APPLY) return `(new upload ${file})`;
  hashUrl[file] = await ensureCurriculumPdf(admin._id, file);
  ours.set(hashUrl[file], file);
  return hashUrl[file];
}

let changes = 0;
async function put(node, field, file, what) {
  const u = await urlOf(file);
  const cur = node[field] || '';
  if (cur === u) return console.log(`  ok     ${what}: ${short(u)}`);
  if (cur && !ours.has(cur)) return console.log(`  keep   ${what}: holds an admin upload, left alone`);
  console.log(`  ${cur ? 'swap ' : 'set  '}  ${what}: ${cur ? short(cur) + ' -> ' : ''}${short(u)}`);
  node[field] = u;
  changes++;
}
function clearOurs(node, field, what) {
  const cur = node[field] || '';
  if (!cur || !ours.has(cur)) return;
  console.log(`  clear  ${what}: ${short(cur)}`);
  node[field] = '';
  changes++;
}

for (const [n, w] of Object.entries(WEEKS)) {
  const mod = p.modules.find((m) => m.title.startsWith(`WEEK ${n}`));
  if (!mod) throw new Error(`no Week ${n}`);
  console.log(`\n${mod.title}`);
  if (w.reading) await put(mod, 'readingUrl', w.reading, 'week reading material');
  clearOurs(mod, 'notesUrl', 'week teacher notes (the admin\'s)');
  for (const [prefix, brief, solution] of w.work) {
    const ch = mod.chapters.find((c) => c.title.startsWith(prefix));
    if (!ch) { console.log(`  MISSING chapter "${prefix}"`); continue; }
    await put(ch, 'readingUrl', brief, `${prefix} brief`);
    await put(ch, 'notesUrl', solution, `${prefix} solution`);
    for (const t of ch.topics || []) {
      clearOurs(t, 'readingUrl', `${prefix} › ${t.title} lesson copy`);
      clearOurs(t, 'notesUrl', `${prefix} › ${t.title} lesson copy`);
    }
  }
}

console.log(`\n${changes} change(s)`);
if (APPLY && changes) { p.markModified('modules'); await p.save(); console.log('saved'); }
else if (!APPLY) console.log('dry run, nothing written');
await mongoose.disconnect();
