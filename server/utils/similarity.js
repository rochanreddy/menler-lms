// Has this write-up been handed in by somebody else already?
//
// The rubric's red flags catch a brief pasted back and a submission with
// nothing in it. Neither catches the case a mentor actually worries about: two
// students in the same cohort handing in the same work. Every submission used
// to be reviewed in isolation, so both copies scored fine.
//
// ── How ─────────────────────────────────────────────────────────────────────
// A MinHash sketch. Cut the text into overlapping five-word shingles, hash
// each, keep the smallest N hashes. The share of a sketch two documents have in
// common estimates their Jaccard similarity, and a fixed-size sketch is small
// enough to store on every submission and compare in memory. No model call, no
// external service, and comparing two sketches costs nothing.
//
// ── Two things it must not do ───────────────────────────────────────────────
//   * It must not fire on the assignment brief. Students quote the brief, and
//     a cohort all quoting the same four sentences would look like a cohort all
//     copying each other. So the brief's own shingles are subtracted from every
//     sketch before anything is compared.
//   * It must not score. A duplicate is an accusation a mentor investigates,
//     not a deduction. It is reported as a red flag with the other student's
//     name and the measured overlap, and it changes no number. Two people who
//     genuinely worked together on a permitted pair task would trip this, and
//     only a human knows that.

const SKETCH_SIZE = 128;
const SHINGLE_WORDS = 5;
// Under this many words a sketch is noise: two students writing three sentences
// about the same assignment will share shingles honestly.
const MIN_WORDS = 60;

/** Case, punctuation and whitespace carry no signal here, so they go. */
function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// FNV-1a, 32-bit. Fast, dependency-free, and the distribution is good enough
// for MinHash; this is not a security hash and does not need to be.
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function shingleHashes(text) {
  const w = words(text);
  if (w.length < SHINGLE_WORDS) return new Set();
  const out = new Set();
  for (let i = 0; i + SHINGLE_WORDS <= w.length; i++) {
    out.add(hash32(w.slice(i, i + SHINGLE_WORDS).join(' ')));
  }
  return out;
}

/**
 * A comparable sketch of one submission's text.
 *
 * `brief` is subtracted so quoting the assignment cannot look like collusion.
 * Returns null when there is too little text to say anything honest about.
 */
export function fingerprint(text, brief = '') {
  const wordCount = words(text).length;
  if (wordCount < MIN_WORDS) return null;

  const mine = shingleHashes(text);
  for (const h of shingleHashes(brief)) mine.delete(h);
  if (mine.size < SHINGLE_WORDS) return null;

  return {
    sketch: [...mine].sort((a, b) => a - b).slice(0, SKETCH_SIZE),
    shingles: mine.size,
    words: wordCount,
  };
}

/**
 * Estimated Jaccard similarity of two sketches, 0 to 1.
 *
 * Both sketches are the smallest hashes of their own document, so the estimate
 * is taken over the smallest hashes of the UNION: take the N smallest values
 * across both, and count how many of those appear in both. Comparing the raw
 * lists instead would read two documents of very different lengths as less
 * alike than they are.
 */
export function similarity(a, b) {
  if (!a?.sketch?.length || !b?.sketch?.length) return 0;
  const setA = new Set(a.sketch);
  const setB = new Set(b.sketch);
  const union = [...new Set([...a.sketch, ...b.sketch])].sort((x, y) => x - y);
  const n = Math.min(SKETCH_SIZE, a.sketch.length, b.sketch.length, union.length);
  if (!n) return 0;
  let shared = 0;
  for (const h of union.slice(0, n)) if (setA.has(h) && setB.has(h)) shared++;
  return shared / n;
}

// Where a mentor should be told. Set from what these two numbers mean in
// practice: independent write-ups on the same assignment land well under 0.2,
// and a copy with the names changed still lands far above 0.45.
export const NEAR_DUPLICATE = 0.45;
export const WORTH_MENTIONING = 0.30;

/**
 * Compare one submission against its peers on the same assignment.
 *
 * `others` is [{ studentName, fingerprint }]. Returns the matches worth a
 * mentor's attention, strongest first, as red flags with their evidence.
 */
export function findDuplicates(mine, others = []) {
  if (!mine) return [];
  return others
    .map((o) => ({ ...o, score: similarity(mine, o.fingerprint) }))
    .filter((o) => o.score >= WORTH_MENTIONING)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((o) => ({
      flag: o.score >= NEAR_DUPLICATE ? 'possible duplicate submission' : 'unusual overlap with another submission',
      evidence: `${Math.round(o.score * 100)}% of this write-up's wording is shared with ${o.studentName}'s submission for the same assignment, after the assignment brief was discounted. This is a measurement, not a conclusion: check whether they were allowed to work together.`,
    }));
}
