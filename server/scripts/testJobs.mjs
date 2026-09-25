// The job board's shortlist, checked without a network or a database:
//
//   npm run test:jobs
//
// Everything that decides WHICH 300 jobs a Menler student sees lives in
// utils/jobShortlist.js as pure functions, so it can be proved here: the
// weighting, the gates, the exclusions, the de-duplication and the per-employer
// cap. If the board ever starts showing a senior role, a Spanish-speaker
// rater, the same opening three times or forty postings from one company,
// this says so in a second.

import {
  MENLER_WEIGHTS,
  GATES,
  SHORTLIST_SIZE,
  PER_COMPANY,
  candidateFilter,
  menlerScore,
  isExcludedTitle,
  isTiedAbroad,
  isTopicOnlyTitle,
  UNNAMED_EMPLOYER_PENALTY,
  sameJobKey,
  curate,
  applyFilters,
  domainCounts,
  facetCounts,
} from '../utils/jobShortlist.js';
import { parseFilters, isHttpUrl, PAGE_SIZE } from '../routes/jobs.js';

let bad = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : ' FAIL '}${m}`); if (!c) bad++; };

const job = (over = {}) => ({
  title: 'AI Automation Intern',
  company: 'Acme',
  domain: 'ai-generalist',
  country: 'India',
  isRemote: false,
  workType: 'internship',
  experienceLevel: 'internship',
  relevance: 60,
  achievability: 88,
  indiaFit: 92,
  easeOfApply: 60,
  postedAt: new Date('2026-09-24'),
  ...over,
});

const NO_FILTERS = { domains: [], workTypes: [], levels: [], places: [], search: '' };

// ── the weighting ───────────────────────────────────────────────────────────
const sum = Object.values(MENLER_WEIGHTS).reduce((a, b) => a + b, 0);
ok(Math.abs(sum - 1) < 1e-9, `Menler weights sum to 1 (${sum})`);
ok(MENLER_WEIGHTS.relevance > MENLER_WEIGHTS.achievability, 'the syllabus outweighs reachability, unlike Skeo');
ok(menlerScore({ company: 'Acme', relevance: 100, achievability: 100, indiaFit: 100, easeOfApply: 100 }) === 100, 'a perfect job scores 100');
ok(menlerScore({}) === 0, 'a job with no scores scores 0, not NaN');

// The reason this board exists: an on-topic AI role must beat an off-topic
// one that is merely easy to get. Skeo's weights rank these the other way.
const aiRole = job({ relevance: 70, achievability: 55, indiaFit: 92, easeOfApply: 54 });
const walkIn = job({ title: 'Customer Service Executive', relevance: 12, achievability: 88, indiaFit: 92, easeOfApply: 54 });
ok(menlerScore(aiRole) > menlerScore(walkIn), `on-topic AI role ${menlerScore(aiRole)} beats an easy off-topic one ${menlerScore(walkIn)}`);

// ── the gates ───────────────────────────────────────────────────────────────
const since = new Date('2026-09-15');
const f = candidateFilter(since);
ok(f.relevance.$gte === GATES.minRelevance, `relevance gate at ${GATES.minRelevance}`);
ok(f.indiaFit.$gte === GATES.minIndiaFit, `indiaFit gate at ${GATES.minIndiaFit} (drops onsite-abroad 12 and visa-gated 8, keeps remote-unstated 48)`);
ok(GATES.minIndiaFit > 12 && GATES.minIndiaFit <= 48, 'the indiaFit gate sits between onsite-abroad and remote-unstated');
ok(f.achievability.$gte === GATES.minAchievability, `achievability gate at ${GATES.minAchievability}`);
ok(f['matchedSkills.0'].$exists === true, 'a job must name at least one thing the syllabus teaches');
ok(f.$or[0].postedAt.$gte === since && f.$or[1].postedAt === null, 'the ten-day window, with the first-seen fallback');
ok(f.isActive.$ne === false, 'withdrawn listings are excluded');

// ── title exclusions ────────────────────────────────────────────────────────
for (const t of [
  'Spanish Search Quality Rater - (USA)',
  'AI tester with Arabic language',
  'Generative AI Analyst | German (Germany)',
  'Machine Learning Engineer Graduate (E-Commerce) - TikTok USDS',
  'Solutions Engineer, LATAM',
  'AI Trainer (US only)',
]) ok(isExcludedTitle(t), `excluded: "${t}"`);

for (const t of [
  'AI Automation Intern',
  'Prompt Engineer - Hindi & English',
  'Shape the Future of AI - Sanskrit Talent Hub',
  'Tamil Content Writer (AI)',
  'Generative AI Developer - Bengaluru',
]) ok(!isExcludedTitle(t), `kept: "${t}" (Indian languages and places are not a barrier)`);

// ── a remote role tied to a place abroad is not open ────────────────────────
// Found on the live board: 61 of the first 300 were "remote" with a location
// field naming the US, Canada or East Asia.
for (const location of [
  'Portland, OR, US',
  'Toronto, ON, CA',
  'United States',
  'Hong Kong, Singapore, Taiwan',
  'Remote, US',
  'Remote - United Kingdom',
  'EMEA',
]) ok(isTiedAbroad(job({ country: 'International', isRemote: true, location })), `tied abroad: "${location}"`);

for (const location of ['Remote', 'Anywhere in the World', 'Worldwide', 'Fully Remote', '', null, 'Remote - India']) {
  ok(!isTiedAbroad(job({ country: 'International', isRemote: true, location })), `open: ${JSON.stringify(location)}`);
}
ok(!isTiedAbroad(job({ country: 'India', location: 'Bengaluru, Karnataka' })), 'a job in India is never "tied abroad"');
ok(curate([job({ country: 'International', isRemote: true, location: 'Portland, OR, US' })]).length === 0,
  'a tied-abroad role never reaches the list');

// ── a title that is only a topic ────────────────────────────────────────────
for (const t of ['generative AI', 'Machine Learning', 'Artificial Intelligence']) {
  ok(isTopicOnlyTitle(t), `topic, not a job: "${t}"`);
}
for (const t of [
  'AI Generalist',
  'Data Science Professional',
  'Woman Returnship - Gen AI',
  'AI Architecture Fellowship',
  'Shape the Future of AI - Sanskrit Talent Hub',
  'Prompt Engineer',
]) ok(!isTopicOnlyTitle(t), `a real opening: "${t}"`);

// ── an unnamed employer moves down, not off ─────────────────────────────────
{
  const named = job({ company: 'Acme' });
  const unnamed = job({ company: null });
  ok(menlerScore(named) - menlerScore(unnamed) === UNNAMED_EMPLOYER_PENALTY,
    `no employer named costs ${UNNAMED_EMPLOYER_PENALTY} points`);
  ok(menlerScore(job({ company: 'null' })) === menlerScore(unnamed), 'the string "null" is not an employer');
  const list = curate([unnamed, job({ title: 'Other AI Engineer', company: 'Beta', relevance: 50 })]);
  ok(list.length === 2 && list[0].company === 'Beta', 'it stays on the list, below a named employer of similar standing');
}

// ── de-duplication ──────────────────────────────────────────────────────────
ok(sameJobKey(job({ title: 'AI Intern', company: 'Acme Ltd.' })) === sameJobKey(job({ title: 'ai  intern', company: 'ACME LTD' })),
  'the same opening from two sources is one job, whatever the spacing and case');

{
  const list = curate([
    job({ title: 'AI Intern', company: 'Acme', relevance: 50, source: 'linkedin' }),
    job({ title: 'AI Intern', company: 'Acme', relevance: 70, source: 'indeed' }),
  ]);
  ok(list.length === 1, 'a duplicate is kept once');
  ok(list[0].relevance === 70, 'and the version kept is the best-scoring one');
}

// ── the per-employer cap ────────────────────────────────────────────────────
{
  const many = Array.from({ length: 12 }, (_, i) => job({ title: `AI Engineer ${i}`, company: 'BigCo' }));
  const list = curate([...many, job({ title: 'AI Engineer', company: 'SmallCo', relevance: 31 })]);
  ok(list.filter((j) => j.company === 'BigCo').length === PER_COMPANY, `one employer is capped at ${PER_COMPANY}`);
  ok(list.some((j) => j.company === 'SmallCo'), 'which leaves room for a lower-scoring employer');
}
{
  // Unnamed employers are one bucket, not twelve free passes.
  const unnamed = Array.from({ length: 12 }, (_, i) => job({ title: `AI Developer ${i}`, company: null }));
  ok(curate(unnamed).length === PER_COMPANY, 'listings with no employer share a single cap');
}

// ── order and size ──────────────────────────────────────────────────────────
{
  const list = curate([
    job({ title: 'Low AI Engineer', relevance: 31 }),
    job({ title: 'High AI Engineer', company: 'B', relevance: 90 }),
    job({ title: 'Mid AI Engineer', company: 'C', relevance: 60 }),
  ]);
  ok(list.map((j) => j.title.split(' ')[0]).join(',') === 'High,Mid,Low', 'best Menler score first');
  ok(list.every((j, i) => i === 0 || list[i - 1].menlerScore >= j.menlerScore), 'and never out of order');
}
{
  const tie = curate([
    job({ title: 'Older AI Engineer', company: 'A', postedAt: new Date('2026-09-20') }),
    job({ title: 'Newer AI Engineer', company: 'B', postedAt: new Date('2026-09-24') }),
  ]);
  ok(tie[0]?.title === 'Newer AI Engineer', 'on a tie, the newer posting leads');
}
{
  const flood = Array.from({ length: 900 }, (_, i) => job({ title: `AI Engineer ${i}`, company: `Co ${i}` }));
  ok(curate(flood).length === SHORTLIST_SIZE, `never more than ${SHORTLIST_SIZE}, however many qualify`);
  ok(SHORTLIST_SIZE / PAGE_SIZE === 6, `${SHORTLIST_SIZE} at ${PAGE_SIZE} a page is six pages`);
}
ok(curate([job({ title: 'Spanish Search Quality Rater' })]).length === 0, 'an excluded title never reaches the list');

// ── filters narrow within the 300 ───────────────────────────────────────────
{
  const list = [
    job({ title: 'A', domain: 'ai-ml', country: 'India', isRemote: false }),
    job({ title: 'B', domain: 'product', country: null, isRemote: true, experienceLevel: 'entry' }),
    job({ title: 'C', domain: 'ai-ml', country: 'International', isRemote: false, workType: 'full-time' }),
  ];
  const run = (over) => applyFilters(list, { ...NO_FILTERS, ...over }).map((j) => j.title).join('');

  ok(run({}) === 'ABC', 'no filter shows everything');
  ok(run({ domains: ['ai-ml'] }) === 'AC', 'domain');
  ok(run({ places: ['india'] }) === 'A', 'India');
  ok(run({ places: ['remote'] }) === 'B', 'remote');
  ok(run({ places: ['india', 'remote'] }) === 'AB', 'India or remote');
  ok(run({ levels: ['entry'] }) === 'B', 'level');
  ok(run({ workTypes: ['full-time'] }) === 'C', 'type');
  ok(run({ search: 'b' }) === 'B', 'search is case-insensitive');
  ok(run({ domains: ['ai-ml'], places: ['india'] }) === 'A', 'filters combine');

  const counts = domainCounts(list);
  ok(counts['ai-ml'] === 2 && counts.product === 1, 'domain counts for the menu');
}

// ── chip counts respect the other filters ──────────────────────────────────
{
  const list = [
    job({ title: 'Design Intern', domain: 'design', experienceLevel: 'internship', workType: 'internship', isRemote: true }),
    job({ title: 'Design Lead', domain: 'design', experienceLevel: 'mid', workType: 'full-time' }),
    job({ title: 'ML Intern', domain: 'ai-ml', experienceLevel: 'internship', workType: 'internship' }),
    job({ title: 'ML Engineer', domain: 'ai-ml', experienceLevel: 'mid', workType: 'full-time', isRemote: true }),
    job({ title: 'ML Researcher', domain: 'ai-ml', experienceLevel: 'entry', workType: 'full-time' }),
  ];

  const none = facetCounts(list, NO_FILTERS);
  ok(none.domainTotal === 5 && none.domains.design === 2 && none.domains['ai-ml'] === 3, 'with nothing picked, counts cover the whole list');
  ok(none.levels.internship === 2 && none.remote === 2, 'level and remote counts');
  ok(none.india === 5 && none.placeTotal === 5, 'India count for the Place menu');

  const design = facetCounts(list, { ...NO_FILTERS, domains: ['design'] });
  ok(design.levels.internship === 1, 'with Design picked, "Internship" counts design internships only (1, not 2)');
  ok(design.remote === 1, 'and "Remote" counts remote design roles only');
  ok(design.domains['ai-ml'] === 3 && design.domainTotal === 5,
    "a chip's own group ignores its own pick, so switching domain shows what each would give");

  const both = facetCounts(list, { ...NO_FILTERS, domains: ['ai-ml'], levels: ['mid'] });
  ok(both.remote === 1 && both.workTypes['full-time'] === 1, 'counts combine every other active filter');
}

// ── the query string is untrusted ───────────────────────────────────────────
{
  const p = parseFilters({ domain: 'product,nonsense', place: ['india', 'mars'] });
  ok(p.domains.join() === 'product' && p.places.join() === 'india', 'unknown values are dropped, not passed through');

  const hostile = parseFilters({ domain: { $ne: 'x' }, place: { $gt: '' }, search: { $regex: '.*' } });
  ok(hostile.domains.length === 0 && hostile.places.length === 0 && hostile.search === '', 'an operator in the query string is ignored');

  ok(parseFilters({ page: '0' }).page === 1 && parseFilters({ page: 'abc' }).page === 1, 'nonsense pages fall back to 1');
  ok(parseFilters({ search: 'x'.repeat(500) }).search.length === 120, 'search is length-capped');
}

// ── only http(s) is ever a link ─────────────────────────────────────────────
ok(isHttpUrl('https://jobs.example/1') && isHttpUrl('http://x.test'), 'http(s) links pass');
for (const u of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', '/relative', '', null, 42]) {
  ok(!isHttpUrl(u), `refused as a link: ${JSON.stringify(u)}`);
}

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
