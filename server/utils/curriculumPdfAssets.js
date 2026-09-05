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

// Module title prefix → ebook filename. Fellowship = Generalist, Kickstarter = Kickstarter.
// Modules with no entry keep whatever reading material an admin attached by hand.
export const CURRICULUM_PDF_RULES = {
  Kickstarter: [
    { prefix: 'S01', file: 'Menler-Kickstarter-Session1-Ebook.pdf' },
    { prefix: 'S02', file: 'Menler-Kickstarter-Session2-Ebook.pdf' },
  ],
  Generalist: [
    { prefix: 'WEEK 1', file: 'Menler-Fellowship-Week1-Ebook_3.pdf' },
    { prefix: 'WEEK 2', file: 'Menler-Fellowship-Week2-Ebook.pdf' },
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

function modulePdfFile(programTitle, moduleTitle) {
  const rules = CURRICULUM_PDF_RULES[programTitle] || [];
  const hit = rules.find((r) => moduleTitle.startsWith(r.prefix));
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

/**
 * Attach each module's ebook as the reading material for its lessons.
 *
 * Only fills a lesson whose reading slot is EMPTY. An admin who attached a
 * better PDF in the curriculum editor outranks the repo's default, and a seed
 * that overwrote them would make the editor pointless — you would lose the
 * upload on the next re-author. Teacher notes are deliberately left alone:
 * they are a different document, not a second copy of the student ebook.
 */
export function applyModuleReadingPdfs(modules, programTitle, urlByFile) {
  return modules.map((m) => {
    const file = modulePdfFile(programTitle, m.title);
    const readingUrl = file ? urlByFile[file] || '' : '';
    if (!readingUrl) return m;
    return {
      ...m,
      chapters: m.chapters.map((ch) => ({
        ...ch,
        topics: ch.topics.map((t) => (t.readingUrl && !isPlaceholder(t.readingUrl) ? t : { ...t, readingUrl })),
      })),
    };
  });
}
