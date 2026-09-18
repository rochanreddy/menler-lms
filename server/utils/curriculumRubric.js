// Reads a piece of curriculum work and says how it should be graded and what
// a student has to put in the folder.
//
// Used by scripts/syncCurriculumAssignments.js, which prints every row it
// produces in its dry run. That printout is the point: this file makes an
// informed guess from the brief, and a human confirms all twenty-seven rows
// before anything is written. Nothing here should ever run unsupervised.
//
// Three things come out of one brief:
//
//   rubricClass         which of the five weightings in utils/rubric.js applies
//   deliverables        the explicit C1 checklist, from the brief's "Submit:" line
//   requiredDriveTypes  what the folder must contain to pass verification
//
// ── On video ────────────────────────────────────────────────────────────────
// Video is required wherever a brief actually asks for one, and nowhere else.
// It is never sent to a model: a mentor watches it and verifies it themselves.
// Before this, the schema default demanded a video of EVERY assignment, so a
// student who submitted a perfect Claude Artifact and a screenshot was told
// their folder was incomplete.

import { CLASS_KEYS, DEFAULT_CLASS } from './rubric.js';

// ── Rubric class ────────────────────────────────────────────────────────────
// Matched on the assignment title, not inferred, because the twenty-seven
// titles are fixed by the two PDFs and a table you can read beats a heuristic
// you have to trust. A title that matches nothing falls through to the
// heuristic below and then to class B, and the sync script prints which.
const BY_TITLE = [
  // A · Drill — thirty minutes, one screenshot and a few sentences.
  [/AI Audit/i, 'A'],
  [/Interface Comparison Drill/i, 'A'],
  [/One Connector, One Real Task/i, 'A'],
  [/Post-Demo LinkedIn Post/i, 'A'],
  [/AI-Native Profile Update/i, 'A'],

  // B · Artefact — a document or Artifact that IS the deliverable.
  [/Prompt Rewrite Battle/i, 'B'],
  [/AI Workflow Map/i, 'B'],
  [/Build Your First Custom Skill/i, 'B'],
  [/Connected Claude Workspace/i, 'B'],
  [/Research Intelligence Pipeline/i, 'B'],
  [/Morning Brief Schedule/i, 'B'],
  [/Build 2 Routines/i, 'B'],
  [/Data Interrogation/i, 'B'],
  [/My AI Landscape Report/i, 'B'],

  // C · System — a live running thing plus its documentation.
  [/External Automation/i, 'C'],
  [/My Claude OS, First Build/i, 'C'],
  [/My Automated AI System/i, 'C'],
  [/Capstone Scope Document/i, 'C'],
  [/P01\s*·/i, 'C'],
  [/P02\s*·/i, 'C'],   // a research PIPELINE another person must be able to run
  [/P03\s*·/i, 'C'],
  [/Milestone Project 1\s*·/i, 'C'],
  [/Milestone Project 3\s*·/i, 'C'],

  // D · Creative — assets judged on craft and prompt rationale.
  [/Creative Asset Set/i, 'D'],
  [/AI Media Kit/i, 'D'],
  [/Milestone Project 2\s*·/i, 'D'],

  // E · Capstone — public, demoed, portfolio-grade.
  [/Vibe Code Something Real/i, 'E'],
  [/Capstone Project, Final Polish/i, 'E'],
  [/Capstone Product, Ship It/i, 'E'],
  [/P04\s*·/i, 'E'],
  [/Milestone Project 4\s*·/i, 'E'],
];

/** Last resort for a title the table does not know, e.g. one a mentor added. */
function guessClass(title, text) {
  const all = `${title}\n${text}`;
  if (/\bcapstone\b|demo day|public URL|portfolio piece/i.test(all)) return 'E';
  if (/\bmedia kit\b|creative asset|Midjourney|DALL-E|Ideogram|Blender|Runway|Suno/i.test(all)) return 'D';
  if (/\bautomation\b|\bn8n\b|\bzapier\b|\bmake\b|voice agent|runs? end-to-end|without manual input/i.test(all)) return 'C';
  if (/screenshot/i.test(all) && all.length < 400) return 'A';
  return DEFAULT_CLASS;
}

export function rubricClassFor(title, text = '') {
  for (const [re, cls] of BY_TITLE) if (re.test(title)) return { rubricClass: cls, matched: true };
  return { rubricClass: guessClass(title, text), matched: false };
}

// ── Deliverables ────────────────────────────────────────────────────────────

// Where the hand-in instruction lives, in the order it should be looked for.
// Kickstarter assignments end in "Submit: …"; Generalist weeklies carry
// "Submit as: …" in their Submission lesson; Kickstarter projects spell out a
// bulleted Deliverables section.
//
// A Generalist milestone's "What to build" is deliberately NOT read. It is
// prose, not a list, and splitting prose into a checklist produced rows like
// "or product idea" and fifteen fragments of "Choose one: (A) … (B) …". A
// wrong checklist is worse than none, because C1 then marks a student down for
// failing to deliver something the brief never asked for. Those four
// milestones get no checklist, the prompt says so, and C1 falls back to
// reading the brief. If they should be scored against a list, the list belongs
// in scripts/curricula.js as an explicit array, which is a curriculum edit.
const DELIVERABLES_SECTION = /^##\s*Deliverables\s*$([\s\S]*)/im;
const SUBMIT_LINES = [
  /\bSubmit as:\s*([^\n]+)/i,
  /\bSubmit:\s*([^\n]+)/i,
];

// Trailing sentences that are about what happens NEXT, not about what to hand
// in. "Becomes a portfolio asset." is not a deliverable and must not become a
// checklist row the student is marked down for missing.
const TRAILERS = /\b(Becomes a portfolio asset|Feeds into|Post to Discord and get|Time estimate|Bonus)\b[\s\S]*$/i;

/** Split on a separator, but only at the top level — never inside brackets. */
function splitTop(s, chars) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && chars.includes(ch)) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out;
}

// Strips a LIST MARKER only: a bullet, or a number that is followed by a dot
// or a bracket. A bare leading number is part of the deliverable and stays,
// because "3 screenshots" and "3 iteration prompts" and "90-second Loom demo"
// are counts a student is graded against, and an earlier version that ate them
// turned every one of those into "screenshots", "iteration prompts" and
// "second Loom demo".
const clean = (s) => s
  .replace(/^\s*(?:[\-–—•*]+|\d+[.)])\s+/, '')
  .replace(/^\s+/, '')
  .replace(/[\s.;]+$/, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Turn a hand-in instruction into a checklist.
 *
 * Splits on "+" and "·" first, which the briefs use to mean "and also". Commas
 * are split too, but a fragment of one or two words after a comma is a
 * qualifier rather than a new deliverable ("Structured PDF or Notion document,
 * shareable") and is glued back on. " and " is never split on, because
 * "Day 1 and Day 3 outputs side by side" is one thing.
 */
function toChecklist(raw) {
  const items = [];
  for (const chunk of splitTop(raw.replace(TRAILERS, ''), '+·')) {
    const parts = splitTop(chunk, ',').map(clean).filter(Boolean);
    let current = '';
    for (const part of parts) {
      if (current && part.split(' ').length <= 2) { current += `, ${part}`; continue; }
      if (current) items.push(current);
      current = part;
    }
    if (current) items.push(current);
  }
  return items.filter((s) => s.length > 2);
}

export function deliverablesFor(text = '') {
  const section = text.match(DELIVERABLES_SECTION);
  if (section) {
    // JavaScript has no \Z, so an end-of-string lookahead cannot be spelled the
    // way it can in other flavours: /(?=^##\s|\Z)/ silently means "or a literal
    // Z", which cut P03's third deliverable at "One external Zap". So take
    // everything to the end and trim the next heading off by hand.
    const body = section[1].split(/^##\s/m)[0];
    const lines = body.split('\n').map(clean).filter((s) => s.length > 3);
    if (lines.length > 1) return lines;
    if (lines.length === 1) return toChecklist(lines[0]);
  }
  for (const re of SUBMIT_LINES) {
    const m = text.match(re);
    if (m) {
      const list = toChecklist(m[1]);
      if (list.length) return list;
    }
  }
  return [];
}

// ── What the folder must contain ────────────────────────────────────────────

// Read against the hand-in instruction where there is one, and the whole brief
// otherwise. Deliberately permissive: this is a GATE, and a gate that is too
// strict rejects work that is actually fine, which is the failure this whole
// change exists to undo.
const VIDEO = /\b(loom|demo video|video walkthrough|walkthrough video|screen recording|recording of|record a|\d+[-\s]?(second|sec|minute|min)\s+(video|walkthrough|demo)|demo recording)\b/i;
const IMAGE = /\b(screenshot|screen shot|screengrab|photo|image)s?\b/i;
const DOC = /\b(document|doc|pdf|write[- ]?up|brief|summary|report|sheet|notes?|instructions|prompts?|map|deck|playbook|transcript|scope)\b/i;
const ARTIFACT = /\b(artifact|artefact|live url|public url|html|web page|webpage|deployed|notion|gamma)\b/i;

export function requiredTypesFor(text = '') {
  const submit = (text.match(/\bSubmit(?: as)?:\s*([\s\S]{0,400})/i) || [])[1] || text;
  const required = [];
  if (VIDEO.test(submit)) required.push('video');
  if (IMAGE.test(submit)) required.push('image');
  // A doc is the floor. Every piece of work in both curricula asks for words of
  // some kind, and it is also the only type the review can always read — but an
  // Artifact-only brief must not be forced to also contain a PDF, so an
  // artifact brief with no other document language stands on its own.
  if (DOC.test(submit) || !ARTIFACT.test(submit)) required.push('doc');
  if (!required.length) required.push('doc');

  return {
    requiredDriveTypes: required,
    // Allowed, not required: a Claude Artifact may arrive as an .html file, or
    // equally as a PDF export or a shared link. Verification must accept all
    // three, so this only lifts driveVerify's default block on HTML and never
    // demands one. Before this the two were the same flag, so opting an
    // assignment into HTML made an .html file mandatory.
    allowHtml: ARTIFACT.test(text),
  };
}

// ── What the session taught ─────────────────────────────────────────────────
// Feeds the rubric's C3, so "used Claude Skills" is checkable against what the
// class was actually about rather than judged as a general vibe.
export function taughtFor({ moduleTitle, chapterTitle }) {
  return [moduleTitle, chapterTitle].filter(Boolean).join(' — ');
}

/** Everything the sync script needs for one piece of work. */
export function classifyWork({ title, description, moduleTitle, chapterTitle }) {
  const { rubricClass, matched } = rubricClassFor(title, description);
  const { requiredDriveTypes, allowHtml } = requiredTypesFor(description);
  return {
    rubricClass,
    matchedByTitle: matched,
    deliverables: deliverablesFor(description),
    requiredDriveTypes,
    allowHtml,
    taught: taughtFor({ moduleTitle, chapterTitle }),
  };
}

export { CLASS_KEYS };
