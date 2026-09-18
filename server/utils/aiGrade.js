// Automated submission review: ONE call to one model.
//
// The whole pipeline is:
//
//   1. utils/urlCheck.js tries every link in the submission   (no model)
//   2. one multimodal request: documents, artifacts and screenshots together,
//      scored against the six-criterion rubric in utils/rubric.js, which also
//      returns the draft feedback
//   3. utils/similarity.js compares the write-up with the other submissions on
//      the same assignment                                     (no model)
//   4. the arithmetic, here                                    (no model)
//
// ── Why one call and not three ──────────────────────────────────────────────
// It used to be three, and every one of the reasons was a workaround:
//
//   * a separate VISION call, because the previous provider's text model was
//     blind and its only seeing model lived on a different endpoint. Gemini
//     Flash-Lite reads text and images in the same request, so that split
//     bought nothing but latency and two failure modes.
//   * a separate NARRATIVE call, so the prose would be written against numbers
//     that were already settled. Over-caution: it re-sent the entire rubric
//     result as input to write four sentences, for about a third of the cost of
//     every review. The prose must not quote a score anyway (the totals are
//     computed after the model replies), so there was nothing to settle first.
//
// One call is three times cheaper, three times faster, and has two outcomes
// instead of eight. It also triples what Google's free tier covers, since that
// tier is rationed by REQUESTS per day rather than by tokens.
//
// ── Three rules that survive every rewrite ──────────────────────────────────
//
//   * Arithmetic lives in JS, never in the prompt. Totals, percentages, the
//     weighted score, the band and the letter grade are all derived in
//     utils/rubric.js. A model asked to add up its own scores can drift; a
//     model asked only to judge cannot make 3+4 equal 8.
//   * Every result is ADVISORY. Nothing here writes to Submission.score /
//     .feedback / .status. A mentor reads this and still grades by hand. That
//     matters most for red flags, which are accusations, not measurements.
//   * Video is never sent to a model. It is listed in the manifest for the
//     mentor to watch and verify themselves, and its absence is never held
//     against a student. Nor is a failure on OUR side: an image we could not
//     fetch CREDITS the criteria that rested on it (utils/rubric.js,
//     CREDITED_SCORE) rather than scoring them low.

import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { ai, MODEL, MAX_TOKENS, AI_GRADE_MODEL } from './aiProvider.js';
import {
  CRITERIA, CRITERION_KEYS, CLASSES, DEFAULT_CLASS,
  RUBRIC_SYSTEM, buildContent, scoreSubmission, creditedCriteria,
} from './rubric.js';
import { checkUrls } from './urlCheck.js';
import { fingerprint, findDuplicates } from './similarity.js';

export { AI_GRADE_MODEL };

// A red flag is only actionable if it says what triggered it, so evidence is
// part of the shape rather than something the prompt asks for politely.
const RedFlag = z.object({
  flag: z.string(),
  evidence: z.string().describe('The specific text, or the numbered artefact, that triggered this flag.'),
});

// Everything the review needs, in one response. The prose sits beside the
// scores rather than in a second call: the same model wrote both in one pass,
// so they cannot disagree with each other.
const ReviewResult = z.object({
  criteria: z.array(z.object({
    key: z.enum(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']),
    score: z.number().int().min(1).max(5),
    feedback: z.string().describe("One sentence quoting or pointing at the student's actual work."),
  })).describe('Exactly six entries, one per criterion, in order.'),
  deliverables_check: z.array(z.object({
    deliverable: z.string(),
    present: z.boolean(),
    evidence: z.string().describe('Which numbered artefact satisfied it, or what was missing.'),
  })).describe('One entry per item on the DELIVERABLES list, in order.'),
  red_flags: z.array(RedFlag),
  summary: z.string(),
  student_feedback: z.string().describe('3-4 sentences addressed to the student. Never states a score.'),
  mentor_notes: z.string().describe('1-2 sentences for the mentor, surfacing any red flag.'),
});

/**
 * The single model call.
 *
 * `parse` sends the zod schema as a strict json_schema response_format and
 * hands back the validated object, so a malformed or off-shape reply fails
 * here rather than downstream.
 */
async function askModel(content) {
  let completion;
  try {
    completion = await ai().chat.completions.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Judgement, not invention. A grader that varies run to run is one a
      // mentor cannot calibrate against, and two students who wrote the same
      // thing should get the same number.
      temperature: 0,
      messages: [
        { role: 'system', content: RUBRIC_SYSTEM },
        { role: 'user', content },
      ],
      response_format: zodResponseFormat(ReviewResult, 'review_result'),
    });
  } catch (err) {
    // The SDK raises this before handing the response back, so the
    // finish_reason check below never sees it.
    if (err?.constructor?.name === 'LengthFinishReasonError' || /length limit was reached/i.test(err?.message || '')) {
      throw new Error(`The model ran out of room before finishing (${MAX_TOKENS} tokens). Raise AI_MAX_TOKENS, or lower the reading caps in utils/submissionContent.js.`);
    }
    throw err;
  }

  const choice = completion.choices[0];
  const parsed = choice?.message?.parsed;
  if (!parsed) {
    // Told apart rather than lumped together, because the causes need
    // different fixes and one vague message sent mentors to the wrong one.
    if (choice?.message?.refusal) throw new Error(choice.message.refusal);
    if (choice?.finish_reason === 'length') {
      throw new Error(`The model ran out of room before finishing (${MAX_TOKENS} tokens). Raise AI_MAX_TOKENS.`);
    }
    throw new Error(`The review came back in an unusable shape (finish_reason: ${choice?.finish_reason || 'unknown'}).`);
  }

  // A model that returns five criteria, or the same one twice, must not
  // silently produce a grade over a different denominator than the rubric
  // says. Missing keys are a hard failure; duplicates keep the first.
  const seen = new Map();
  for (const c of parsed.criteria) if (!seen.has(c.key)) seen.set(c.key, c);
  const missing = CRITERION_KEYS.filter((k) => !seen.has(k));
  if (missing.length) throw new Error(`The review left out ${missing.join(', ')}.`);

  return { ...parsed, criteria: CRITERION_KEYS.map((k) => seen.get(k)) };
}

/**
 * Review one submission end to end.
 *
 * Takes the assignment context, a manifest from utils/submissionContent.js and
 * the fingerprints of the other submissions on this assignment. Returns the
 * object stored on Submission.aiReview.
 */
export async function reviewSubmission({ manifest, peers = [], ...context }) {
  const notes = [...manifest.notes];
  const rubricClass = CLASSES[context.rubricClass] ? context.rubricClass : DEFAULT_CLASS;

  // Everything the student WROTE, as one blob: what links are pulled out of and
  // what the duplicate fingerprint is taken over. Images are excluded on
  // purpose, since a screenshot's pixels are not the student's prose.
  const writtenText = manifest.items
    .filter((it) => it.kind === 'document' || it.kind === 'artifact')
    .map((it) => it.content || '')
    .join('\n\n');

  // 1. Links. Independent of the model, and never allowed to take the review
  //    down with it.
  const links = await checkUrls(writtenText).catch((err) => {
    notes.push(`The link check did not run: ${err.message}`);
    return { results: [], summary: '' };
  });
  if (links.dead) notes.push(`${links.dead} link(s) in this submission are dead.`);

  // 2. The one call. Documents, artifacts and screenshots, all at once.
  const imageItems = manifest.items.filter((it) => it.kind === 'screenshot' || it.kind === 'image');
  const imagesSent = imageItems.filter((it) => it.dataUrl).length;
  const result = await askModel(buildContent({ ...context, rubricClass, manifest, links }));

  // The base64 must not reach the stored review: it is several MB per image.
  for (const it of manifest.items) delete it.dataUrl;

  // 3. Arithmetic, here and never in the prompt.
  const readableNonImages = manifest.items.some(
    (it) => (it.kind === 'document' || it.kind === 'artifact') && it.content,
  );
  const credited = creditedCriteria({ rubricClass, imagesSent, imageCount: imageItems.length, readableNonImages });
  const scored = scoreSubmission({ rubricClass, criteria: result.criteria, credited });
  for (const c of credited) notes.push(`${c.key} was credited, not assessed. ${c.why}`);

  // 4. Has anyone else handed this in? Measured, never scored: it is reported
  //    beside the model's own flags, with the overlap and the other student's
  //    name, for a mentor to judge.
  const mine = fingerprint(writtenText, context.brief);
  const red_flags = [...result.red_flags, ...findDuplicates(mine, peers)];

  const videos = manifest.items.filter((it) => it.kind === 'video');
  if (videos.length) {
    notes.push(`${videos.length === 1 ? 'A video was' : `${videos.length} videos were`} submitted and not reviewed: ${videos.map((v) => v.name).join(', ')}. Please watch and verify ${videos.length === 1 ? 'it' : 'them'} yourself.`);
  }

  return {
    ...scored,
    deliverables_check: result.deliverables_check,
    red_flags,
    summary: result.summary,
    student_feedback: result.student_feedback,
    mentor_notes: result.mentor_notes,
    evidence: manifest.items.map(({ n, kind, name, meta, unreadable }) => ({ n, kind, name, meta, unreadable: unreadable || null })),
    links: links.results,
    notes,
    // Stored so the NEXT submission on this assignment can be compared against
    // this one without re-downloading and re-parsing the whole Drive folder.
    fingerprint: mine,
  };
}

export { CRITERIA, CLASSES };
