// The brief and the solution book that belong to a piece of work, resolved
// out of the curriculum and hung on the Assignment row the student submits
// against.
//
// The two PDFs are attached to the curriculum node — Kickstarter's
// "Assignment: …" lesson, Generalist's "Weekly Assignment: …" chapter — so
// until now they were reachable only from Learning → Content, several clicks
// away from the tab a student is actually on when they go looking for the
// brief. Assignment documents are per BATCH and carry no media of their own.
//
// Resolved at READ time rather than copied onto the row by
// scripts/syncCurriculumAssignments.js: the media belongs to the admin, who
// attaches and replaces it in the curriculum editor whenever they like, and a
// snapshot would go stale the moment they did without anyone re-running a
// script. The link is the title — which is exactly what the sync script
// matches on, so the two cannot disagree.
import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

const firstOf = (nodes, field) => nodes.map((n) => n[field]).find(Boolean) || '';

// Only what the chip needs. A material carries an uploader and a timestamp
// that are nobody's business on this screen.
const plain = (m) => ({ url: m.url, name: m.name || '', kind: m.kind === 'resource' ? 'resource' : 'notes' });

/**
 * title → { briefUrl, solutionUrl, materials } for every chapter and lesson in
 * a programme.
 *
 * A chapter resolves to its own files and then to its lessons' — that is where
 * the assignment rules actually put them (Generalist's brief lands on the
 * "Submission" lesson inside the chapter) — and never upwards to the week,
 * whose ebook is the week's, not this assignment's.
 *
 * First title wins. Assignment and project titles are unique across a
 * curriculum, and the duplicates that do exist ("Submission", "What's
 * covered") are never an assignment's title, so a collision is unreachable.
 */
function indexProgram(program) {
  const byTitle = new Map();
  const put = (title, entry) => {
    const k = norm(title);
    if (k && !byTitle.has(k)) byTitle.set(k, entry);
  };
  for (const mod of program.modules || []) {
    for (const chap of mod.chapters || []) {
      const lessons = chap.topics || [];
      put(chap.title, {
        briefUrl: chap.readingUrl || firstOf(lessons, 'readingUrl'),
        solutionUrl: chap.notesUrl || firstOf(lessons, 'notesUrl'),
        materials: [...(chap.materials || []), ...lessons.flatMap((t) => t.materials || [])].map(plain),
      });
      for (const t of lessons) {
        put(t.title, {
          briefUrl: t.readingUrl || '',
          solutionUrl: t.notesUrl || '',
          materials: (t.materials || []).map(plain),
        });
      }
    }
  }
  return byTitle;
}

const NONE = { briefUrl: '', solutionUrl: '', materials: [] };

const batchIdOf = (a) => String(a.batchId?._id || a.batchId || '');

/**
 * Hang `briefUrl`, `solutionUrl` and `materials` on every assignment in the
 * list. Takes and returns PLAIN objects — call `.toObject()` first.
 *
 * Two queries whatever the list's length: the batches it spans, then their
 * programmes, with lesson bodies and overviews projected away so this never
 * drags a whole curriculum's prose through for two PDF links.
 */
export async function attachWorkMaterials(assignments) {
  if (!assignments.length) return assignments;

  const batchIds = [...new Set(assignments.map(batchIdOf).filter(Boolean))];
  const batches = await Batch.find({ _id: { $in: batchIds } }).select('programId').lean();
  const programIds = [...new Set(batches.map((b) => String(b.programId || '')).filter(Boolean))];
  if (!programIds.length) return assignments.map((a) => ({ ...a, ...NONE }));

  const programs = await Program.find({ _id: { $in: programIds } })
    .select({
      'modules.description': 0,
      'modules.chapters.description': 0,
      'modules.chapters.topics.body': 0,
      description: 0,
    })
    .lean();

  const byProgram = new Map(programs.map((p) => [String(p._id), indexProgram(p)]));
  const byBatch = new Map(batches.map((b) => [String(b._id), byProgram.get(String(b.programId))]));

  return assignments.map((a) => ({ ...a, ...(byBatch.get(batchIdOf(a))?.get(norm(a.title)) || NONE) }));
}
