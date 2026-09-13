// Move the ebooks up to the week or session they belong to.
//
// Reading material used to be attachable only on a lesson, so the seeds
// stamped the week's ebook onto every lesson of the week — the same file on
// "Key topics covered", on the assignment's "Submission", on the milestone.
// The admin panel therefore showed nothing against the week or the session
// itself, while the books are organised exactly that way: one per week, or one
// per week+session.
//
// Weeks and sessions now carry their own reading and notes slots
// (models/Program.js) and a lesson resolves lesson → session → week. That
// makes the old lesson-level copies a trap: a lesson's own slot wins, so a
// per-session book attached to S1 would be shadowed on its lesson by the
// week-wide copy still sitting there. This script clears the trap once:
//
//   1. attaches each rule-mapped ebook (utils/curriculumPdfAssets.js) to its
//      week or session, and clears lessons that pointed at that same file;
//   2. where every lesson of a session, or every session of a week, still
//      carries one identical reading (or notes) PDF, hoists it a level.
//
// Nothing a student opens changes — every lesson resolves to the file it
// resolved to before. Only WHERE the attachment lives moves, so that the admin
// panel shows it against the week or session and a later per-session book is
// not hidden. seed:content does the same on every run; this is for a live
// database, which the seeds refuse to touch.
//
//   node scripts/liftCurriculumEbooks.js                   # dry run, changes nothing
//   CONFIRM_DB=menler node scripts/liftCurriculumEbooks.js --apply
//   CONFIRM_DB=menler node scripts/liftCurriculumEbooks.js Generalist --apply   # one programme only
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { Program } from '../models/Program.js';
import { FileAsset } from '../models/FileAsset.js';
import { User } from '../models/User.js';
import { CURRICULUM_PDF_RULES, applyCurriculumEbooks, liftSharedMedia, ensureCurriculumPdf } from '../utils/curriculumPdfAssets.js';

const APPLY = process.argv.includes('--apply');
// Name a programme to leave every other one exactly as it is.
const ONLY = process.argv.slice(2).find((a) => !a.startsWith('--')) || '';

// A dry run must not write, and ensureCurriculumPdf upserts — so on a dry run
// look the ebooks up by name only and report any it cannot find.
async function ebookUrls(adminId) {
  const files = new Set(Object.values(CURRICULUM_PDF_RULES).flatMap((rules) => rules.map((r) => r.file)));
  const urls = {};
  for (const file of files) {
    if (APPLY) { urls[file] = await ensureCurriculumPdf(adminId, file); continue; }
    const row = await FileAsset.findOne({ kind: 'curriculum-pdf', name: file }).sort({ createdAt: 1 }).select('_id');
    if (row) urls[file] = `/uploads/${row._id}`;
    else console.log(`  (${file} is not in the database yet; --apply would load it)`);
  }
  return urls;
}

const label = (node, url) => `${node.title.slice(0, 58).padEnd(58)} ${url ? url.replace('/uploads/', '…/') : '-'}`;

async function run() {
  await connectDb();
  const dbName = mongoose.connection.name;
  if (APPLY && process.env.CONFIRM_DB !== dbName) {
    console.error(`\n✗ Connected to "${dbName}" but CONFIRM_DB is "${process.env.CONFIRM_DB || ''}". Set CONFIRM_DB=${dbName} to apply.\n`);
    process.exit(1);
  }
  console.log(`\n─── lift curriculum ebooks on "${dbName}" ${APPLY ? '(APPLYING)' : '(dry run)'} ───\n`);

  const admin = await User.findOne({ role: 'admin' }).select('_id');
  if (!admin) throw new Error('No admin user — nothing to own the ebooks.');
  const urls = await ebookUrls(admin._id);

  // How many lesson and session slots still hold a file — the lift is the
  // drop in that number, whichever of the two passes did the clearing.
  const filled = (mods) => mods.reduce((n, m) => n + m.chapters.reduce((k, ch) =>
    k + ['readingUrl', 'notesUrl'].filter((f) => ch[f]).length
      + ch.topics.reduce((j, t) => j + ['readingUrl', 'notesUrl'].filter((f) => t[f]).length, 0), 0), 0);

  const programs = await Program.find(ONLY ? { title: ONLY } : {});
  if (ONLY && !programs.length) throw new Error(`No programme titled "${ONLY}".`);
  for (const p of programs) {
    const before = JSON.stringify(p.modules);
    const was = filled(p.modules);
    applyCurriculumEbooks(p.modules, p.title, urls);
    liftSharedMedia(p.modules);
    const lifted = was - filled(p.modules);
    const changed = JSON.stringify(p.modules) !== before;

    console.log(`  ${p.title}${changed ? '' : ' — already in shape'}`);
    for (const m of p.modules) {
      console.log(`    W ${label(m, m.readingUrl)}`);
      for (const ch of m.chapters) {
        if (ch.readingUrl || ch.notesUrl) console.log(`      S ${label(ch, ch.readingUrl)}`);
        for (const t of ch.topics) if (t.readingUrl) console.log(`        L ${label(t, t.readingUrl)}  (its own)`);
      }
    }
    if (changed) console.log(`    ${lifted} lesson/session slot(s) ${APPLY ? 'cleared' : 'would be cleared'} in favour of the week or session above them`);
    if (changed && APPLY) { p.markModified('modules'); await p.save(); }
    console.log('');
  }

  if (!APPLY) console.log(`  Dry run. Re-run with:  CONFIRM_DB=${dbName} node scripts/liftCurriculumEbooks.js --apply\n`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => { console.error('lift failed:', err); process.exit(1); });
