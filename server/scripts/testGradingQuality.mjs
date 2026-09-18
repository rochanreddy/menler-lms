// Can this model actually TELL GOOD WORK FROM BAD?
//
//   GEMINI_API_KEY=… node scripts/testGradingQuality.mjs
//   GEMINI_API_KEY=… node scripts/testGradingQuality.mjs gemini-3.5-flash-lite gemini-3.5-flash
//
// Everything else in this repo checks that a model REPLIES: the key works, the
// schema round-trips, the endpoint is right. None of that is the question that
// matters. The question is whether a cheap model can separate a strong
// submission from a weak one, because a grader that gives everybody 4 out of 5
// is worse than no grader at all: it looks like it is working, mentors start
// trusting it, and it is telling them nothing.
//
// ── How it decides ──────────────────────────────────────────────────────────
// Three fixture submissions for the SAME assignment, written to sit far apart:
//
//   STRONG  real numbers, quoted prompts, a reversal, a measured outcome
//   THIN    plausible, fluent, and empty. The one a weak grader marks as good,
//           because it reads well and says nothing that could only be true of
//           one student.
//   COPIED  the assignment brief pasted back with two sentences bolted on
//
// A usable grader puts a wide gap between them and raises "copied brief" on
// the third. A model that returns 78 / 72 / 68 has not read anything: it has
// pattern-matched "student assignment" and returned the average. That is the
// failure this script exists to catch, and it is invisible on a single sample.
//
// THIN vs STRONG is the real test. COPIED is easy and every model gets it.

import 'dotenv/config';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { RUBRIC_SYSTEM, buildUserMessage, scoreSubmission, CRITERION_KEYS } from '../utils/rubric.js';

const KEY = process.env.GEMINI_API_KEY;
const BASE = (process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '');
const MODELS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!MODELS.length) MODELS.push('gemini-3.5-flash-lite');

if (!KEY) {
  console.error(`GEMINI_API_KEY is not set.

Get one free at https://aistudio.google.com/apikey (no card needed), then:
  GEMINI_API_KEY=... npm run test:quality`);
  process.exit(1);
}

const client = new OpenAI({ apiKey: KEY, baseURL: BASE, timeout: 120000, maxRetries: 1 });

const BRIEF = `Take 5 prompts; rewrite each using CLEAR; show before/after. Run both versions for 2 prompts; compare outputs. Build a Prompt Cheat Sheet: 10+ prompts organised by category (writing, research, analysis, planning, coding).
Submit: Claude Artifact, Prompt Cheat Sheet. Becomes a portfolio asset.`;

const SUBMISSIONS = [
  {
    label: 'STRONG',
    expect: 'high',
    text: `I run the Friday newsletter for our college coding club, 412 subscribers.

Prompt 1 BEFORE: "write a newsletter about our club events"
Prompt 1 AFTER: "Context: 412-subscriber weekly newsletter for a coding club in Pune. Length: 250 words. Examples: last three issues attached. Audience: 2nd and 3rd year CS students, casual. Result: 3 event blurbs, one CTA."
The BEFORE version invented a "hackathon on Saturday" twice. The AFTER version stopped.

Prompt 2 BEFORE: "summarise this meeting"
Prompt 2 AFTER: added "Return exactly: decisions, owners, deadlines. If a deadline was not stated, write 'not set' rather than guessing."
That final sentence was the whole fix. Before it, Claude assigned dates nobody agreed to. I only found this because our treasurer asked why he had a Tuesday deadline he had never heard of.

Prompts 3 to 5 rewritten the same way (bug reports, LinkedIn drafts, reading summaries), before/after in the Artifact.

I ran both versions of prompts 1 and 2 five times each. AFTER needed one edit per run instead of five or six.

Cheat sheet: 12 prompts. Writing 3, research 2, analysis 3, planning 2, coding 2.

What I got wrong: I first wrote the CLEAR context as one long paragraph and outputs got worse, not better. Splitting it into labelled lines fixed it. I also could not get British spelling to hold, it still slips about one word in twenty, so I check that by hand.

Time: about 2 hours per issue down to 25 minutes, measured over three weeks.`,
  },
  {
    label: 'THIN',
    expect: 'low',
    text: `In this assignment I learned about the CLEAR framework and how it can be used to improve prompts significantly.

I took five prompts and rewrote each of them using the CLEAR framework. The CLEAR framework stands for Context, Length, Examples, Audience and Result. Each of these components plays an important role in making a prompt more effective.

After rewriting the prompts, I observed that the outputs were much better than before. The AI understood my requirements more clearly and produced results that were more relevant and useful. This shows the power of good prompt engineering.

I also ran both versions for two prompts and compared the outputs. The comparison clearly showed that the CLEAR version was superior in terms of quality, relevance and structure.

Finally, I built a Prompt Cheat Sheet containing more than ten prompts organised by category, including writing, research, analysis, planning and coding. This will be a valuable resource for me going forward and will definitely become a portfolio asset.

Overall this assignment helped me understand the importance of prompt engineering and I will continue to apply these learnings in my future work.`,
  },
  {
    label: 'COPIED',
    expect: 'lowest',
    text: `Take 5 prompts; rewrite each using CLEAR; show before/after. Run both versions for 2 prompts; compare outputs. Build a Prompt Cheat Sheet: 10+ prompts organised by category (writing, research, analysis, planning, coding).

I have done all of the above. The cheat sheet is attached and it will become a portfolio asset.`,
  },
];

const Result = z.object({
  criteria: z.array(z.object({
    key: z.enum(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']),
    score: z.number().int().min(1).max(5),
    feedback: z.string(),
  })),
  deliverables_check: z.array(z.object({
    deliverable: z.string(), present: z.boolean(), evidence: z.string(),
  })),
  red_flags: z.array(z.object({ flag: z.string(), evidence: z.string() })),
  summary: z.string(),
  // The real schema now carries the prose too, since it is one call. Testing a
  // simplified shape would prove the model handles a schema it will never see.
  student_feedback: z.string(),
  mentor_notes: z.string(),
});

async function grade(model, sub) {
  const t0 = Date.now();
  const user = buildUserMessage({
    programName: 'AI Kickstarter',
    assignmentTitle: 'Assignment: Prompt Rewrite Battle + Personal Prompt Library',
    assignmentType: 'assignment',
    rubricClass: 'B',
    brief: BRIEF,
    deliverables: ['Claude Artifact', 'Prompt Cheat Sheet'],
    taught: 'S01 - Prompting Fundamentals, The CLEAR Framework',
    manifest: { items: [{ n: 1, kind: 'document', name: 'writeup.pdf', meta: `${sub.text.length} characters`, content: sub.text }] },
    links: { results: [] },
  });

  const r = await client.chat.completions.parse({
    model,
    max_tokens: 8000,
    temperature: 0,
    messages: [{ role: 'system', content: RUBRIC_SYSTEM }, { role: 'user', content: user }],
    response_format: zodResponseFormat(Result, 'rubric_result'),
  });

  const parsed = r.choices[0]?.message?.parsed;
  if (!parsed) throw new Error(r.choices[0]?.message?.refusal || `unusable shape (finish: ${r.choices[0]?.finish_reason})`);

  // Deduped the way utils/aiGrade.js does, then through the REAL arithmetic, so
  // the number printed here is the number a mentor would have seen.
  const seen = new Map();
  for (const c of parsed.criteria) if (!seen.has(c.key)) seen.set(c.key, c);
  const missing = CRITERION_KEYS.filter((k) => !seen.has(k));
  if (missing.length) throw new Error(`left out ${missing.join(', ')}`);

  const scored = scoreSubmission({ rubricClass: 'B', criteria: CRITERION_KEYS.map((k) => seen.get(k)) });
  return {
    score: scored.weighted_score,
    band: scored.result,
    criteria: scored.criteria,
    flags: parsed.red_flags,
    secs: (Date.now() - t0) / 1000,
    tokens: r.usage?.total_tokens ?? 0,
  };
}

for (const model of MODELS) {
  console.log(`\n${'='.repeat(64)}\n${model}\n${'='.repeat(64)}`);
  const out = {};
  let broke = false;

  for (const sub of SUBMISSIONS) {
    try {
      const r = await grade(model, sub);
      out[sub.label] = r;
      console.log(`\n${sub.label.padEnd(7)} ${String(r.score).padStart(3)}/100  ${r.band.padEnd(15)} ${r.secs.toFixed(1)}s  ${r.tokens} tok`);
      console.log(`        ${r.criteria.map((c) => `${c.key}:${c.score}`).join('  ')}`);
      console.log(`        C2 (real work): ${r.criteria.find((c) => c.key === 'C2').feedback.slice(0, 110)}`);
      if (r.flags.length) console.log(`        FLAGS: ${r.flags.map((f) => f.flag).join(', ')}`);
    } catch (err) {
      broke = true;
      console.log(`\n${sub.label.padEnd(7)} FAILED: ${err.message}`);
    }
  }

  if (broke || !out.STRONG || !out.THIN || !out.COPIED) {
    console.log(`\n  VERDICT: unusable. It did not return a valid result for every submission.`);
    continue;
  }

  // ── The verdict ──
  // Two gaps, and they are not equally hard. Anyone can spot a pasted brief.
  // Telling fluent-and-empty from specific-and-real is the whole job.
  const realGap = out.STRONG.score - out.THIN.score;
  const copyGap = out.THIN.score - out.COPIED.score;
  const caughtCopy = out.COPIED.flags.some((f) => /copied|brief|insufficient/i.test(f.flag));
  // 20/100 is the FLOOR: six criteria at 1 out of 5. When both weak fixtures
  // land there, a zero gap between them is the grader agreeing that both are
  // failing work, not a grader that cannot tell them apart. An earlier version
  // of this script demanded THIN beat COPIED by five points and so reported a
  // model with a 64-point real gap as "marginal", which is exactly backwards.
  const bothFloored = out.THIN.score <= 21 && out.COPIED.score <= 21;

  console.log(`\n${'-'.repeat(64)}`);
  console.log(`  STRONG over THIN    ${realGap > 0 ? '+' : ''}${realGap} points   <- the one that matters`);
  console.log(`  THIN over COPIED    ${copyGap > 0 ? '+' : ''}${copyGap} points${bothFloored ? '   (both at the 20/100 floor, so this is agreement, not blindness)' : ''}`);
  console.log(`  flagged the paste   ${caughtCopy ? 'yes' : 'NO'}`);
  console.log(`  slowest review      ${Math.max(...Object.values(out).map((r) => r.secs)).toFixed(1)}s`);

  // The real gap carries the verdict. Catching the paste is a pass/fail gate on
  // top of it, not a second gap to clear.
  const verdict = realGap >= 20 && caughtCopy
    ? 'USABLE. It separates real work from fluent filler by a margin a mentor can act on, and it caught the pasted brief.'
    : realGap >= 20
      ? 'SEPARATES WELL but did NOT flag the pasted brief. Check the red-flag rules in the prompt before shipping.'
      : realGap >= 10
        ? 'MARGINAL. It ranks them correctly but the gap is narrow, so borderline work will land wherever the sampling falls. Try the bigger model.'
        : realGap > 0
          ? 'TOO FLAT. Correct order, almost no separation. It is pattern-matching "assignment", not reading. Do not ship this.'
          : 'BROKEN. It scored fluent filler at or above real work. Do not ship this.';
  console.log(`\n  VERDICT: ${verdict}`);
}

console.log(`
Read it this way: the STRONG-over-THIN gap is the number to trust. THIN is
written to be fluent, on-topic, complete against the brief, and completely
empty of anything only one student could have written. A grader worth having
punishes that. A grader that rewards it will quietly teach your cohort that
padding scores well.
`);
process.exit(0);
