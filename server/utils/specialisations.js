import mongoose from 'mongoose';

// The six tracks a student can take after the AI Generalist, in the order the
// offer lists them. `key` is permanent; `title` is only the first name — the
// admin can reword it on the Specialisations tab and the key keeps it the
// same track. A seventh is one more line here.
export const SPECIALISATIONS = [
  { key: 'analyst', title: 'Analyst' },
  { key: 'finance-operations', title: 'Finance Operations' },
  { key: 'founders-office', title: 'Founder’s Office' },
  { key: 'human-resource', title: 'Human Resource' },
  { key: 'marketing', title: 'Marketing' },
  { key: 'product-management', title: 'Product Management' },
];

/** Make sure all six exist. Idempotent: matched on key, never overwrites. */
export async function ensureSpecialisations(Specialisation) {
  await Specialisation.bulkWrite(SPECIALISATIONS.map((s, order) => ({
    updateOne: {
      filter: { key: s.key },
      update: { $setOnInsert: { key: s.key, title: s.title, order } },
      upsert: true,
    },
  })));
}

// ── Cleaning what the editor sends ──────────────────────────────────────────
//
// The admin's editor saves the whole syllabus at once, so everything in it is
// checked here before it is written: unknown fields dropped, text trimmed and
// capped, every link something a browser can open, and every existing `_id`
// carried through so a module renamed is the same module, not a new one.
// Pure, so tests/specialisations.test.js can pin it without a database.

export const LIMITS = {
  title: 160,
  description: 20000,
  body: 50000,
  modules: 60,
  lessons: 60,
  materials: 60,
};

// Ours (root-relative /uploads/<id>) or http(s). Nothing else — a
// `javascript:` link in a reading slot would run in the student's tab.
export const isOpenableLink = (u) => /^https?:\/\/\S+$/i.test(u) || /^\/uploads\/[a-f0-9]{24}$/i.test(u);
// A reading slot opens in the PDF reader, so only our stored files and links
// that end in .pdf are honest there.
const isReadingLink = (u) => /^\/uploads\/[a-f0-9]{24}$/i.test(u) || /^https?:\/\/\S+\.pdf([?#]\S*)?$/i.test(u);

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const idOrNew = (v) => (v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : new mongoose.Types.ObjectId());

class SyllabusError extends Error {
  constructor(message) { super(message); this.status = 400; }
}
export { SyllabusError };

function cleanMaterials(list, where) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new SyllabusError(`The files on ${where} are not a list.`);
  if (list.length > LIMITS.materials) throw new SyllabusError(`${where} has more than ${LIMITS.materials} files.`);
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const url = text(m?.url, 2000);
    if (!url) continue;
    if (!isOpenableLink(url)) throw new SyllabusError(`A file on ${where} has a link that does not start with https://.`);
    // The same file twice on one node is one entry.
    if (seen.has(url)) continue;
    seen.add(url);
    const addedAt = m?.addedAt && !Number.isNaN(new Date(m.addedAt).getTime()) ? new Date(m.addedAt) : new Date();
    out.push({
      _id: idOrNew(m?._id),
      url,
      name: text(m?.name, 300) || url,
      kind: m?.kind === 'resource' ? 'resource' : 'notes',
      addedAt,
    });
  }
  return out;
}

function cleanReading(node, where) {
  const url = text(node?.readingUrl, 2000);
  if (!url) return { readingUrl: '', readingName: '' };
  if (!isReadingLink(url)) throw new SyllabusError(`The reading material on ${where} must be an uploaded PDF or a link to a .pdf.`);
  return { readingUrl: url, readingName: text(node?.readingName, 300) };
}

/** The editor's `modules` array → what is safe to store. Throws SyllabusError. */
export function cleanModules(modules) {
  if (!Array.isArray(modules)) throw new SyllabusError('The syllabus is not a list of modules.');
  if (modules.length > LIMITS.modules) throw new SyllabusError(`A specialisation can have up to ${LIMITS.modules} modules.`);
  return modules.map((m, mi) => {
    const title = text(m?.title, LIMITS.title);
    const where = title ? `“${title}”` : `module ${mi + 1}`;
    if (!title) throw new SyllabusError(`Module ${mi + 1} needs a title.`);
    const lessons = m?.lessons ?? [];
    if (!Array.isArray(lessons)) throw new SyllabusError(`The lessons in ${where} are not a list.`);
    if (lessons.length > LIMITS.lessons) throw new SyllabusError(`${where} has more than ${LIMITS.lessons} lessons.`);
    return {
      _id: idOrNew(m?._id),
      title,
      summary: text(m?.summary, LIMITS.description),
      ...cleanReading(m, where),
      materials: cleanMaterials(m?.materials, where),
      lessons: lessons.map((l, li) => {
        const lt = text(l?.title, LIMITS.title);
        if (!lt) throw new SyllabusError(`Lesson ${li + 1} in ${where} needs a title.`);
        const lw = `“${lt}”`;
        const classLink = text(l?.classLink, 2000);
        if (classLink && !/^https?:\/\/\S+$/i.test(classLink)) throw new SyllabusError(`The class link on ${lw} must start with https://.`);
        return {
          _id: idOrNew(l?._id),
          title: lt,
          body: text(l?.body, LIMITS.body),
          classLink,
          ...cleanReading(l, lw),
          materials: cleanMaterials(l?.materials, lw),
        };
      }),
    };
  });
}

/** The track-wide resources list, cleaned the same way. */
export const cleanResources = (list) => cleanMaterials(list, 'the track');

/** Counts the admin's cards show. */
export function syllabusCounts(spec) {
  const modules = spec.modules || [];
  const lessons = modules.reduce((n, m) => n + (m.lessons || []).length, 0);
  const files = (spec.resources || []).length
    + modules.reduce((n, m) => n + (m.readingUrl ? 1 : 0) + (m.materials || []).length
      + (m.lessons || []).reduce((k, l) => k + (l.readingUrl ? 1 : 0) + (l.materials || []).length, 0), 0);
  return { modules: modules.length, lessons, files };
}
