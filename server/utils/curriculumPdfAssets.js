// The week/session ebooks that ship with the repo, loaded into Mongo as
// FileAssets and attached to the curriculum as each module's reading material.
//
// The bytes live in `server/assets/curriculum-pdfs/` and are committed, because
// the seeds are the only thing that reads them and a seed that depends on a
// file sitting on one laptop is not reproducible. Students never fetch these
// from disk: they are served from Mongo through the authenticated
// `/api/lms/uploads/:id` route like any other stored file.
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FileAsset } from '../models/FileAsset.js';

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../assets/curriculum-pdfs');

// Which PDF goes where. Each rule names a module by title prefix and lands
// its file on one of three nodes:
//   · the module itself           { module, file }            — the week / session ebook
//   · a session (chapter) in it   { module, session, file }   — a per-session ebook
//   · a lesson in it              { module, lesson, file, notes } — an assignment: the
//     one-page brief as reading material, the solution book as teacher notes
// A lesson with an empty slot opens its session's file, else its module's
// (resolution is lesson → chapter → module, see models/Program.js).
// Fellowship = Generalist. Nodes with no rule keep whatever an admin attached.
//
// A rule-mapped file lives ONLY where its rule puts it: a copy of the week's
// ebook on a lesson, or Session 2's brief on a Session 1 lesson, is cleared
// on the next seed or lift. Files that no rule knows about are never touched.
export const CURRICULUM_PDF_RULES = {
  Kickstarter: [
    { module: 'S01', file: 'Menler-Kickstarter-Session1-Ebook.pdf' },
    { module: 'S02', file: 'Menler-Kickstarter-Session2-Ebook.pdf' },
    { module: 'S03', file: 'Menler-Kickstarter-Session3-Ebook.pdf' },
    { module: 'S04', file: 'Menler-Kickstarter-Session4-Ebook.pdf' },
    // One assignment book per session, and it covers the whole session: every
    // "Assignment:" lesson in it carries the one-page brief as reading and the
    // solution book as notes. The "What's covered" lessons and the projects
    // keep the session ebook.
    { module: 'S01', lesson: 'Assignment:', file: 'Menler-Kickstarter-S1-Assignment1.pdf', notes: 'Menler-Kickstarter-S1-Assignment1-Solution-Book.pdf' },
    { module: 'S02', lesson: 'Assignment:', file: 'Menler-Kickstarter-S2-Assignment1.pdf', notes: 'Menler-Kickstarter-S2-Assignment1-Solution-Book.pdf' },
    { module: 'S03', lesson: 'Assignment:', file: 'Menler-Kickstarter-S3-Assignment1.pdf', notes: 'Menler-Kickstarter-S3-Assignment1-Solution-Book.pdf' },
    { module: 'S04', lesson: 'Assignment:', file: 'Menler-Kickstarter-S4-Assignment1.pdf', notes: 'Menler-Kickstarter-S4-Assignment1-Solution-Book.pdf' },
  ],
  Generalist: [
    // The week ebook on the week, a session ebook on each session, and the
    // week's one assignment on its "Weekly Assignment" submission lesson —
    // brief as reading, solution book as notes. Week 2's brief says it IS
    // Milestone Project 1, so that project's submission carries it too.
    { module: 'WEEK 1', file: 'Menler-Fellowship-Week1-Ebook_3.pdf' },
    { module: 'WEEK 1', session: 'S1', file: 'Menler-Fellowship-Week1-Session1-Ebook.pdf' },
    { module: 'WEEK 1', session: 'S2', file: 'Menler-Fellowship-Week1-Session2-Ebook.pdf' },
    { module: 'WEEK 1', session: 'Weekly Assignment', lesson: 'Submission', file: 'Menler-Fellowship-Week1-Assignment.pdf', notes: 'Menler-Fellowship-Week1-Assignment-Solution-Book.pdf' },
    { module: 'WEEK 2', file: 'Menler-Fellowship-Week2-Ebook.pdf' },
    { module: 'WEEK 2', session: 'S1', file: 'Menler-Fellowship-Week2-Session1-Ebook.pdf' },
    { module: 'WEEK 2', session: 'S2', file: 'Menler-Fellowship-Week2-Session2-Ebook.pdf' },
    { module: 'WEEK 2', session: 'Weekly Assignment', lesson: 'Submission', file: 'Menler-Fellowship-Week2-Assignment.pdf', notes: 'Menler-Fellowship-Week2-Assignment-Solution-Book.pdf' },
    { module: 'WEEK 2', session: 'Milestone Project 1', lesson: 'Submission', file: 'Menler-Fellowship-Week2-Assignment.pdf', notes: 'Menler-Fellowship-Week2-Assignment-Solution-Book.pdf' },
  ],
};

/** Every file the rules mention, for one programme or for all of them. */
export const ruleFiles = (programTitle) =>
  [...new Set((programTitle ? CURRICULUM_PDF_RULES[programTitle] || [] : Object.values(CURRICULUM_PDF_RULES).flat())
    .flatMap((r) => [r.file, r.notes]).filter(Boolean))];

// Stand-ins that seedFull.js writes onto every lesson so the fixture cohort has
// something to click. They are fine in a test database and wrong in a real
// curriculum — the marketing brochure is not week five's reading, and the
// recording link is a joke video — so anything that authors real content treats
// them as an empty slot rather than as content worth protecting.
export const FIXTURE_PLACEHOLDERS = new Set([
  'https://menler.in/pdfs/Menler_AI_Kickstarter_Curriculum.pdf',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://zoom.us/j/98765432101',
]);

export const isPlaceholder = (url) => FIXTURE_PLACEHOLDERS.has(String(url || '').trim());

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Load one curriculum PDF into Mongo, or reuse the row that already holds these
 * exact bytes. Returns `/uploads/:id`.
 *
 * Keyed on the content hash rather than the filename, and it reuses the OLDEST
 * match. Both matter: the URL written into the curriculum has to stay the same
 * across runs, or every re-seed detaches the PDF that students are reading and
 * leaves the old blob orphaned in the database.
 */
export async function ensureCurriculumPdf(ownerId, filename) {
  const path = join(ASSETS_DIR, filename);
  if (!existsSync(path)) throw new Error(`Missing curriculum PDF: ${path}`);

  const data = readFileSync(path);
  const hash = sha256(data);

  // Prefer a hash match; fall back to name+size for rows stored before hashes
  // were recorded, and stamp the hash on as we go.
  const existing =
    (await FileAsset.findOne({ kind: 'curriculum-pdf', hash }).sort({ createdAt: 1 })) ||
    (await FileAsset.findOne({ kind: 'curriculum-pdf', name: filename, size: data.length }).sort({ createdAt: 1 }));

  if (existing) {
    // The bytes are already right — only ever write the fields that identify
    // them. Re-saving the buffer would rewrite megabytes for nothing.
    if (existing.hash !== hash || existing.name !== filename) {
      existing.hash = hash;
      existing.name = filename;
      await existing.save();
    }
    return `/uploads/${existing._id}`;
  }

  const asset = await FileAsset.create({
    data,
    name: filename,
    mimeType: 'application/pdf',
    size: data.length,
    hash,
    ownerId,
    kind: 'curriculum-pdf',
  });
  return `/uploads/${asset._id}`;
}

/** Upsert every known ebook and return filename → url. */
export async function loadCurriculumPdfUrls(ownerId) {
  const urls = {};
  for (const file of ruleFiles()) urls[file] = await ensureCurriculumPdf(ownerId, file);
  return urls;
}

const empty = (url) => !url || isPlaceholder(url);

const startsWith = (title, prefix) => String(title || '').startsWith(prefix);

/**
 * Attach the rule-mapped PDFs to the curriculum — on the week, the session or
 * the lesson each rule names — and clear the same files from anywhere else.
 *
 * Only fills a slot that is EMPTY. An admin who attached a better PDF in the
 * curriculum editor outranks the repo's default, and a seed that overwrote
 * them would make the editor pointless — you would lose the upload on the
 * next re-author. Notes are filled only where a rule carries a `notes` file:
 * the solution book is a different document, not a copy of the ebook.
 *
 * The clearing matters as much as the fill. Earlier seeds stamped the week's
 * ebook onto every lesson, and a lesson's own slot wins over its session's —
 * so a per-session book attached later would have been shadowed on every
 * lesson by the week-wide copy. And a brief uploaded by hand onto the wrong
 * session's lesson is the same file in the wrong place. A rule-mapped file
 * pointed at from a node its rule does not name is therefore cleared FIRST,
 * and the empty slots filled after. Files no rule knows about are left alone.
 *
 * Mutates in place and returns the same array, so it works on plain objects
 * from curricula.js and on a Mongoose document's subdocuments alike.
 */
export function applyCurriculumEbooks(modules, programTitle, urlByFile) {
  const rules = CURRICULUM_PDF_RULES[programTitle] || [];
  const url = (file) => (file && urlByFile[file]) || '';
  const ruleUrls = new Set(rules.flatMap((r) => [url(r.file), url(r.notes)]).filter(Boolean));

  // Where each rule lands: node → { readingUrl?, notesUrl? }.
  const wanted = new Map();
  const want = (node, field, u) => {
    if (!u) return;
    if (!wanted.has(node)) wanted.set(node, {});
    wanted.get(node)[field] = u;
  };
  for (const m of modules) {
    for (const r of rules) {
      if (!startsWith(m.title, r.module)) continue;
      if (!r.session && !r.lesson) { want(m, 'readingUrl', url(r.file)); continue; }
      for (const ch of m.chapters || []) {
        if (r.session && !startsWith(ch.title, r.session)) continue;
        if (!r.lesson) { want(ch, 'readingUrl', url(r.file)); continue; }
        for (const t of ch.topics || []) {
          if (!startsWith(t.title, r.lesson)) continue;
          want(t, 'readingUrl', url(r.file));
          want(t, 'notesUrl', url(r.notes));
        }
      }
    }
  }

  const nodes = modules.flatMap((m) => [m, ...(m.chapters || []).flatMap((ch) => [ch, ...(ch.topics || [])])]);
  for (const n of nodes) {
    for (const f of ['readingUrl', 'notesUrl']) {
      if (n[f] && ruleUrls.has(n[f]) && wanted.get(n)?.[f] !== n[f]) n[f] = '';
    }
  }
  for (const [n, w] of wanted) {
    for (const f of Object.keys(w)) if (empty(n[f])) n[f] = w[f];
  }
  return modules;
}

/**
 * Where every lesson of a session, or every session of a week, carries the
 * same reading (or the same notes), move it up a level. Renders identically —
 * the lessons resolve to the same file — but it is then attached ONCE, where
 * the admin panel shows it against the week or session, and a per-session
 * book attached later is not shadowed by copies on each lesson.
 *
 * Returns how many lesson/chapter slots were cleared. Mutates in place.
 */
export function liftSharedMedia(modules) {
  let lifted = 0;
  const same = (rows, f) => {
    const urls = rows.map((r) => r[f] || '');
    return rows.length && urls[0] && !isPlaceholder(urls[0]) && urls.every((u) => u === urls[0]) ? urls[0] : '';
  };
  for (const f of ['readingUrl', 'notesUrl']) {
    for (const m of modules) {
      for (const ch of m.chapters || []) {
        const topics = ch.topics || [];
        // Lessons that all agree AND match nothing above them: hoist.
        const u = same(topics, f);
        if (u && (!ch[f] || ch[f] === u)) {
          ch[f] = u;
          for (const t of topics) { t[f] = ''; lifted++; }
        }
        // Lessons that merely repeat what the session (or week) already says.
        const above = ch[f] || m[f] || '';
        for (const t of topics) if (above && t[f] === above) { t[f] = ''; lifted++; }
      }
      const chapters = m.chapters || [];
      const u = same(chapters, f);
      if (u && (!m[f] || m[f] === u)) {
        m[f] = u;
        for (const ch of chapters) { ch[f] = ''; lifted++; }
      }
      for (const ch of chapters) if (m[f] && ch[f] === m[f]) { ch[f] = ''; lifted++; }
    }
  }
  return lifted;
}

/** What a lesson actually opens: its own slot, else its session's, else its week's. */
export const resolveMedia = (field, module, chapter, topic) =>
  topic?.[field] || chapter?.[field] || module?.[field] || '';
