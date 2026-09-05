// Author the two real Menler curricula into the Learning tree
// (Program → Module → Chapter → Topic), from the official PDFs:
//   · AI Kickstarter    — 4 sessions · 19 topics · 4 portfolio projects
//   · AI Generalist     — 6 weeks · 12 sessions · 4 milestone projects
// The lesson copy itself lives in curricula.js, which both this script and
// seedFull.js read from — there is exactly one place to edit it.
//   npm run seed:content
//
// ── Why this script does more than assign p.modules ─────────────────────────
// Modules/chapters/topics are embedded sub-documents, so writing a new tree
// mints a new _id for every lesson. Three things are keyed on those ids:
//
//   · Progress.completedTopics        — which lessons a student has ticked
//   · BatchLessonVideo (batchId+topicId) — which VdoCipher video plays
//   · User.blocked.moduleIds          — admin module blocks
//
// A naive re-author therefore leaves all three pointing at ids that no longer
// exist. That is not a visible reset: routes/progress.js counts
// completedTopics.length capped at the lesson total, so a student would keep a
// plausible-looking percentage while not one lesson rendered as ticked — and
// that number gates the certificate. So this script does two things about it:
//
//   1. It PRESERVES ids for lessons whose position and title are unchanged, so
//      re-running after a copy edit only disturbs the lessons you actually
//      edited, and a no-op run disturbs nothing.
//   2. It PRUNES the three id-keyed collections of anything left dangling, so
//      the database is never in the silently-wrong state above.
import 'dotenv/config';
import { connectDb } from '../db.js';
import { assertSeedTarget } from './seedGuard.js';
import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { Progress } from '../models/Progress.js';
import { BatchLessonVideo } from '../models/BatchLessonVideo.js';
import { User } from '../models/User.js';
import { loadCurriculumPdfUrls, applyModuleReadingPdfs, isPlaceholder } from '../utils/curriculumPdfAssets.js';
import {
  kickstarterModules,
  generalistModules,
  KICKSTARTER_DESCRIPTION,
  GENERALIST_DESCRIPTION,
} from './curricula.js';

// One entry per programme. Titles must match the ones seedFull.js batches
// against ('Kickstarter', 'Generalist') or the fixture cohort lands on an
// empty tree and refills it with its own placeholder lessons.
const PROGRAMS = [
  { title: 'Kickstarter', description: KICKSTARTER_DESCRIPTION, build: kickstarterModules },
  { title: 'Generalist', description: GENERALIST_DESCRIPTION, build: generalistModules },
];

// A lesson's identity is its position in the tree plus its title — stable
// across edits to the body, and unique because no chapter repeats a topic name.
const topicKey = (m, ch, t) => `${m.title}\u0000${ch.title}\u0000${t.title}`;
const moduleKey = (m) => m.title;

// Per-lesson media is authored in the admin curriculum editor, and curricula.js
// knows nothing about it — it carries lesson copy and nothing else. So a lesson
// rebuilt from curricula.js has every media field empty, and assigning that
// over the live tree silently detaches every PDF an admin has uploaded. The id
// is not the only thing worth carrying across; this is the rest of it.
const MEDIA = ['readingUrl', 'notesUrl', 'classLink', 'contentUrl'];
function carryMedia(fresh, old) {
  const out = { ...fresh };
  // A fixture placeholder is not worth carrying. seedFull.js stamps the same
  // brochure and joke recording onto every lesson, and preserving those would
  // pin the real curriculum to them forever, blocking the module ebook from
  // ever being attached. Treat them as the empty slot they stand in for.
  for (const f of MEDIA) if (old[f] && !isPlaceholder(old[f])) out[f] = old[f];
  // Teacher notes that are byte-for-byte the same link as the reading material
  // are not a document anyone chose: seedFull.js used to assign notesUrl from
  // readingUrl, so the notes chip opened a second copy of the student ebook.
  // An empty slot reading "No notes yet" is the truthful version of that.
  if (out.notesUrl && out.notesUrl === out.readingUrl) out.notesUrl = '';
  // contentType only means anything next to a contentUrl. curricula.js always
  // says 'text' because it attaches no file, so an admin who turned a lesson
  // into a video or a PDF keeps that.
  if (old.contentUrl && old.contentType) out.contentType = old.contentType;
  return out;
}

// Reuse the existing _ids wherever the same lesson is still there, and its
// media along with them. Anything new or renamed gets a fresh id (and so is
// treated as a new lesson, which it is).
function preserveIds(oldModules, newModules) {
  const topics = new Map();
  const modules = new Map();
  for (const m of oldModules || []) {
    modules.set(moduleKey(m), m._id);
    for (const ch of m.chapters || []) {
      for (const t of ch.topics || []) topics.set(topicKey(m, ch, t), t);
    }
  }
  let kept = 0;
  let media = 0;
  const out = newModules.map((m) => ({
    ...m,
    ...(modules.has(moduleKey(m)) ? { _id: modules.get(moduleKey(m)) } : {}),
    chapters: m.chapters.map((ch) => ({
      ...ch,
      topics: ch.topics.map((t) => {
        const old = topics.get(topicKey(m, ch, t));
        if (!old) return t;
        kept++;
        if (MEDIA.some((f) => old[f])) media++;
        return { ...carryMedia(t, old), _id: old._id };
      }),
    })),
  }));
  return { modules: out, kept, media, was: topics.size };
}

const liveTopicIds = (program) =>
  new Set(program.modules.flatMap((m) => m.chapters.flatMap((c) => c.topics.map((t) => String(t._id)))));

// Drop every reference to a lesson this programme no longer has.
async function pruneDangling(program) {
  const topicIds = liveTopicIds(program);
  const report = { progress: 0, ticks: 0, videos: 0 };

  // 1. Student progress — prune stale ticks, drop the row if nothing survives.
  for (const p of await Progress.find({ programId: program._id })) {
    const keep = (p.completedTopics || []).filter((id) => topicIds.has(String(id)));
    if (keep.length === (p.completedTopics || []).length) continue;
    report.ticks += (p.completedTopics || []).length - keep.length;
    if (keep.length === 0 && !p.certificateIssuedAt) {
      await p.deleteOne();
      report.progress++;
    } else {
      p.completedTopics = keep;
      await p.save();
    }
  }

  // 2. VdoCipher attachments, across every batch running this programme.
  const batchIds = (await Batch.find({ programId: program._id }).select('_id')).map((b) => b._id);
  if (batchIds.length) {
    const rows = await BatchLessonVideo.find({ batchId: { $in: batchIds } }).select('_id topicId');
    const dead = rows.filter((r) => !topicIds.has(String(r.topicId))).map((r) => r._id);
    if (dead.length) {
      await BatchLessonVideo.deleteMany({ _id: { $in: dead } });
      report.videos = dead.length;
    }
  }

  return report;
}

// Admin module blocks, judged once against EVERY programme's tree rather than
// per-programme: a block on a module belonging to some other programme must
// survive, and one belonging to nothing at all is dead weight either way.
async function pruneModuleBlocks() {
  const live = new Set(
    (await Program.find({}).select('modules')).flatMap((p) => (p.modules || []).map((m) => String(m._id))),
  );
  let removed = 0;
  for (const u of await User.find({ 'blocked.moduleIds.0': { $exists: true } }).select('blocked')) {
    const before = u.blocked.moduleIds.length;
    u.blocked.moduleIds = u.blocked.moduleIds.filter((id) => live.has(String(id)));
    if (u.blocked.moduleIds.length === before) continue;
    removed += before - u.blocked.moduleIds.length;
    await u.save();
  }
  return removed;
}

async function run() {
  await connectDb();
  assertSeedTarget('seed:content', 'It re-authors both curriculum trees and prunes lesson progress that no longer matches.');
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('No admin user — run npm run seed first.');
  const pdfUrls = await loadCurriculumPdfUrls(admin._id);

  for (const { title, description, build } of PROGRAMS) {
    const fresh = build();

    let program = await Program.findOne({ title });
    if (!program) program = await Program.create({ title, type: 'cohort', published: true });

    const { modules, kept, media, was } = preserveIds(program.modules, fresh);
    program.slug = title.toLowerCase();
    program.modules = applyModuleReadingPdfs(modules, title, pdfUrls);
    program.published = true;
    program.description = description;
    await program.save();

    const pruned = await pruneDangling(program);

    const chapters = program.modules.reduce((n, m) => n + m.chapters.length, 0);
    const topics = program.modules.reduce((n, m) => n + m.chapters.reduce((c, ch) => c + ch.topics.length, 0), 0);
    console.log(`✓ ${title.padEnd(12)} ${program.modules.length} modules · ${chapters} chapters · ${topics} topics`);
    console.log(`  ids           ${kept} of ${was} previous lessons carried over, ${topics - kept} new`);
    console.log(`  media         ${media} lesson(s) kept PDFs/links already attached to them`);
    console.log(`  pruned        ${pruned.ticks} stale lesson ticks (${pruned.progress} progress rows dropped) · ${pruned.videos} orphaned videos`);
  }
  const blocks = await pruneModuleBlocks();
  console.log(`\n  module blocks ${blocks} stale id(s) cleared`);
  console.log('\n✅ Kickstarter and Generalist curricula authored from the PDFs.');
  process.exit(0);
}

run().catch((err) => { console.error('Content seed failed:', err); process.exit(1); });
