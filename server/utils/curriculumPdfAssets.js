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

// Which ebook goes where. Each rule names a module by title prefix and,
// optionally, a session (chapter) inside it by prefix; the file is attached to
// that node — the week for a week-wide book, the session for a per-session one
// — and every lesson under it with no reading of its own opens it (resolution
// is lesson → chapter → module, see models/Program.js). Fellowship = Generalist.
// Modules and sessions with no rule keep whatever an admin attached by hand.
//
// To add a per-session ebook, drop the file in assets/curriculum-pdfs/ and add
//   { module: 'WEEK 1', session: 'S1', file: 'Menler-Fellowship-Week1-Session1-Ebook.pdf' }
export const CURRICULUM_PDF_RULES = {
  Kickstarter: [
    { module: 'S01', file: 'Menler-Kickstarter-Session1-Ebook.pdf' },
    { module: 'S02', file: 'Menler-Kickstarter-Session2-Ebook.pdf' },
  ],
  Generalist: [
    { module: 'WEEK 1', file: 'Menler-Fellowship-Week1-Ebook_3.pdf' },
    { module: 'WEEK 2', file: 'Menler-Fellowship-Week2-Ebook.pdf' },
  ],
};

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

/** The rule-mapped ebook for a module (no `session`) or for one of its sessions. */
function ruleFile(programTitle, moduleTitle, chapterTitle) {
  const rules = CURRICULUM_PDF_RULES[programTitle] || [];
  const hit = rules.find((r) =>
    String(moduleTitle || '').startsWith(r.module) &&
    (chapterTitle === undefined ? !r.session : !!r.session && String(chapterTitle || '').startsWith(r.session)));
  return hit?.file || null;
}

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
  const files = new Set(Object.values(CURRICULUM_PDF_RULES).flatMap((rules) => rules.map((r) => r.file)));
  const urls = {};
  for (const file of files) urls[file] = await ensureCurriculumPdf(ownerId, file);
  return urls;
}

const empty = (url) => !url || isPlaceholder(url);

/**
 * Attach the rule-mapped ebooks to the curriculum, on the week or the session
 * they belong to, and lift any copy of the same file off the lessons beneath.
 *
 * Only fills a slot that is EMPTY. An admin who attached a better PDF in the
 * curriculum editor outranks the repo's default, and a seed that overwrote
 * them would make the editor pointless — you would lose the upload on the
 * next re-author. Teacher notes are deliberately left alone: they are a
 * different document, not a second copy of the student ebook.
 *
 * The lift matters as much as the fill. Earlier seeds stamped the week's ebook
 * onto every lesson, and a lesson's own slot wins over its session's — so a
 * per-session book attached later would have been shadowed on every lesson by
 * the week-wide one. A lesson pointing at exactly the file its week or
 * session now carries is the same reading either way; clearing it changes
 * nothing on screen and stops it shadowing anything.
 *
 * Mutates in place and returns the same array, so it works on plain objects
 * from curricula.js and on a Mongoose document's subdocuments alike.
 */
export function applyCurriculumEbooks(modules, programTitle, urlByFile) {
  for (const m of modules) {
    const mFile = ruleFile(programTitle, m.title);
    const mUrl = (mFile && urlByFile[mFile]) || '';
    if (mUrl && empty(m.readingUrl)) m.readingUrl = mUrl;
    for (const ch of m.chapters || []) {
      const cFile = ruleFile(programTitle, m.title, ch.title);
      const cUrl = (cFile && urlByFile[cFile]) || '';
      if (cUrl && empty(ch.readingUrl)) ch.readingUrl = cUrl;
      // A lesson holding the session's file, or the week's, is a copy: the
      // week's even when the session now has a book of its own, because that
      // copy is an older seed's stamp and the session book is meant to
      // supersede it for every lesson under the session.
      for (const t of ch.topics || []) {
        if (t.readingUrl && (t.readingUrl === ch.readingUrl || t.readingUrl === m.readingUrl)) t.readingUrl = '';
      }
    }
    for (const ch of m.chapters || []) if (m.readingUrl && ch.readingUrl === m.readingUrl) ch.readingUrl = '';
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
