// The one model the automated review talks to.
//
// Gemini, through Google's OpenAI-compatible endpoint, so the client is the
// ordinary OpenAI SDK and nothing here is bespoke.
//
// ── Why there is no provider abstraction any more ───────────────────────────
// There used to be one, with Sarvam and OpenRouter behind a switch. It is gone,
// and its absence is the point: the abstraction cost more than it ever paid.
//
// Sarvam needed two clients on two base URLs (`sarvam-105b` on /v1 is blind and
// rejects images; `gemma4` on /v2 is the only model that sees, and it is a
// whitelisted beta the account never got), so the review had to describe images
// with one model and grade them with another, in separate calls. On top of that
// `sarvam-105b` is a REASONING model: it spends tokens thinking before it
// answers, measured at roughly ten times what this job needs, on a task that is
// "read 2,000 words and return six numbers".
//
// Gemini Flash-Lite is natively multimodal, so documents and images go in ONE
// request to ONE model, and it does not think out loud on your bill. Three
// calls, two endpoints and a provider map collapse into one call. Everything
// about the old setup existed to work around a constraint that no longer
// applies, so keeping it "just in case" would have been keeping the scar
// tissue of a decision already reversed.
//
// Switching vendors again is a base URL, a key and a model id. That is small
// enough to do when it is actually needed, and it is cheaper than carrying a
// second code path nobody exercises.

import OpenAI from 'openai';

// Google's OpenAI-compatibility layer. The SDK appends /chat/completions, so
// any trailing slash here would produce a double slash and a 404.
const BASE_URL = (process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai')
  .replace(/\/+$/, '');

// Flash-Lite, not Flash: on Google's free tier Flash-Lite allows roughly 500
// requests a day and full Flash roughly 20, which is the difference between
// "covers a cohort" and "covers six reviews". Overridable because a model id
// is the thing most likely to be retired under you, and correcting it should
// be an environment variable rather than a deploy.
export const MODEL = process.env.AI_MODEL || 'gemini-3.5-flash-lite';

// Generous for the answer, which is six criteria with prose plus a checklist.
// Flash-Lite does not burn budget on hidden reasoning, so this is close to what
// is actually emitted rather than a guess with headroom for thinking.
export const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 8000;

// Constructed lazily: the server should boot fine without a key, and only the
// review endpoint should fail if one is missing.
let client;
export function ai() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('AI review is not configured on the server (missing GEMINI_API_KEY). Get one free at https://aistudio.google.com/apikey.');
  }
  client ||= new OpenAI({
    apiKey: key,
    baseURL: BASE_URL,
    // Without a ceiling a stalled request does not fail, it HANGS: the review
    // runs synchronously inside the mentor's HTTP request, so the page sits
    // there. An earlier provider held one open for twenty minutes and returned
    // nothing, which is how this line got written.
    timeout: Number(process.env.AI_TIMEOUT_MS) || 90_000,
    maxRetries: 1,
  });
  return client;
}

// Recorded on each stored review, so an old result stays attributable after
// the model id moves under it.
export const AI_GRADE_MODEL = MODEL;
