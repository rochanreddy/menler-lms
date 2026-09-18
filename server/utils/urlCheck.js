// Are the links in a submission actually live?
//
// Four Class E assignments turn on a working public URL: Kickstarter 4.1 (a
// Lovable/Bolt app), 4.3 (a LinkedIn post), Generalist W5 (a deployed route)
// and W6 (the live product). The rubric's C6 asks whether someone else could
// use the thing, and until this existed nothing ever tried the link. A dead
// link, a private Replit and a deleted post all scored exactly the same as a
// working one.
//
// ── This reports, it never scores ───────────────────────────────────────────
// The result goes into the evidence manifest as plain fact for the grader and
// the mentor to read. It does NOT subtract marks by itself, because the checker
// is wrong often enough that it must not be a judge: see the status table below.
//
// ── Why "unreachable" is not the same as "dead" ─────────────────────────────
// A LinkedIn post that works perfectly in a browser answers a server-side fetch
// with 999 or 403. Notion, Replit and Gamma rate-limit and cloak. So only a
// hard, unambiguous negative counts as dead (404, 410, or a hostname that does
// not resolve). Everything else is reported as "could not be checked from here,
// please open it", which is honest and leaves the judgement with the mentor.
// Getting this backwards would fail students for our own user agent.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const TIMEOUT_MS = 6000;
const MAX_URLS = 12;
// The whole check is bounded as well as each request, because a write-up can
// carry a dozen links and the review already holds an HTTP request open.
const BUDGET_MS = 25_000;

// Bare URLs in prose pick up trailing punctuation and closing brackets from the
// sentence around them, so those are trimmed rather than requested.
const URL_RE = /\bhttps?:\/\/[^\s<>"'`\])}]+/gi;
const TRAILING = /[.,;:!?'"’”)\]}]+$/;

/** Every distinct http(s) URL in a blob of text, in the order it appears. */
export function extractUrls(text = '') {
  const seen = new Set();
  const out = [];
  for (const raw of String(text).match(URL_RE) || []) {
    const url = raw.replace(TRAILING, '');
    if (url.length < 12 || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

// Drive links are the submission folder itself and its files. They are already
// verified by utils/driveVerify.js, which checks far more than reachability, so
// re-fetching them here would spend the budget re-proving something known.
const SKIP_HOST = /(^|\.)(drive|docs)\.google\.com$/i;

/**
 * Anything that is not a public internet address.
 *
 * A student's write-up is untrusted text and this runs on our server, so a
 * link to 169.254.169.254 (cloud metadata), 127.0.0.1 or a 10.x address would
 * make the review a request-forgery tool pointed at our own network. Checked
 * after DNS resolution, because a public hostname can resolve to a private
 * address on purpose.
 */
function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (/^f[cd]/.test(v6)) return true;            // unique-local
    if (v6.startsWith('fe80')) return true;         // link-local
    // ::ffff:10.0.0.1 and friends are IPv4 wearing a hat.
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  const [a, b] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;          // link-local + AWS metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true;                         // multicast, reserved
  return false;
}

async function resolvesPublicly(hostname) {
  if (isIP(hostname)) return !isPrivateAddress(hostname);
  try {
    const addrs = await lookup(hostname, { all: true });
    if (!addrs.length) return null;                  // null = did not resolve
    return addrs.every((a) => !isPrivateAddress(a.address));
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') return null;
    return false;
  }
}

// What each outcome means to a reader. `live` and `dead` are the only two the
// grader is allowed to treat as facts about the student's work.
const STATUS = {
  live: 'reachable',
  dead: 'DEAD LINK',
  blocked: 'could not be checked from the server, please open it yourself',
  skipped: 'a Drive link, already verified',
  refused: 'not a public web address, not checked',
};

async function checkOne(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return { url, status: 'refused', detail: 'not a valid URL' }; }
  if (!/^https?:$/.test(parsed.protocol)) return { url, status: 'refused', detail: 'not an http(s) link' };
  if (SKIP_HOST.test(parsed.hostname)) return { url, status: 'skipped' };

  const publicHost = await resolvesPublicly(parsed.hostname);
  if (publicHost === null) return { url, status: 'dead', detail: 'that domain does not exist' };
  if (publicHost === false) return { url, status: 'refused', detail: 'resolves to a private address' };

  // HEAD first: cheaper, and enough for most hosts. Some answer 405 or 403 to a
  // HEAD they would have served as a GET, so that falls through to a GET whose
  // body is dropped as soon as the status line arrives.
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(parsed.href, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'MenlerLMS-LinkCheck/1.0 (+https://menler.in)' },
      });
      try { await res.body?.cancel(); } catch { /* already closed */ }

      if (res.status === 404 || res.status === 410) {
        return { url, status: 'dead', detail: `the page returns ${res.status}` };
      }
      if (res.ok) return { url, status: 'live', detail: `HTTP ${res.status}` };
      if (method === 'HEAD' && (res.status === 405 || res.status === 403 || res.status === 501)) continue;
      // 401/403/429/999 and the rest: works in a browser, refuses a robot.
      return { url, status: 'blocked', detail: `HTTP ${res.status}` };
    } catch (err) {
      if (method === 'HEAD') continue;
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return { url, status: 'blocked', detail: timedOut ? 'timed out' : (err?.message || 'request failed') };
    }
  }
  return { url, status: 'blocked', detail: 'the server refused both HEAD and GET' };
}

/**
 * Check every link found in `text`.
 *
 * Returns { results, summary } where results carry a human-readable `label`.
 * Never throws: a checker that fails must not take the review down with it.
 */
export async function checkUrls(text) {
  const urls = extractUrls(text);
  if (!urls.length) return { results: [], summary: '' };

  const deadline = Date.now() + BUDGET_MS;
  const results = [];
  for (const url of urls.slice(0, MAX_URLS)) {
    if (Date.now() > deadline) {
      results.push({ url, status: 'blocked', detail: 'the link check ran out of time before reaching this one' });
      continue;
    }
    try {
      results.push(await checkOne(url));
    } catch (err) {
      results.push({ url, status: 'blocked', detail: err?.message || 'check failed' });
    }
  }
  if (urls.length > MAX_URLS) {
    results.push({ url: `(+${urls.length - MAX_URLS} more)`, status: 'blocked', detail: `only the first ${MAX_URLS} links were checked` });
  }

  for (const r of results) r.label = [STATUS[r.status], r.detail].filter(Boolean).join(': ');
  const dead = results.filter((r) => r.status === 'dead').length;
  const live = results.filter((r) => r.status === 'live').length;
  return {
    results,
    summary: `${results.length} link(s) found, ${live} reachable, ${dead} dead.`,
    dead,
  };
}

export { STATUS };
