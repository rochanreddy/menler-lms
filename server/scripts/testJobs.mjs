// The job board's shortlist, checked without a network or a database:
//
//   npm run test:jobs
//
// Everything that decides WHICH 750 jobs a Menler student sees lives in
// utils/jobShortlist.js as pure functions, so it can be proved here: the
// weighting, the gates, the lanes, the exclusions, the de-duplication and the
// per-employer cap. If the board ever starts showing a senior role, a Spanish-speaker
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
  LANES,
  laneOf,
  passesLane,
  laneCounts,
  TITLE_BOOST,
  displayCompany,
  laneTargets,
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
  matchedSkills: ['claude'],
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
ok(f.indiaFit.$gte === GATES.minIndiaFit, `indiaFit gate at ${GATES.minIndiaFit} (drops onsite-abroad 12 and visa-gated 8, keeps remote-unstated 48)`);
ok(GATES.minIndiaFit > 12 && GATES.minIndiaFit <= 48, 'the indiaFit gate sits between onsite-abroad and remote-unstated');
ok(f.achievability.$gte === GATES.minAchievability, `achievability gate at ${GATES.minAchievability}`);
ok(f.$and[0].$or[0].postedAt.$gte === since && f.$and[0].$or[1].postedAt === null, 'the ten-day window, with the first-seen fallback');
ok(f.isActive.$ne === false, 'withdrawn listings are excluded');
ok(f.$and[1].$or[0].relevance.$gte === 10, 'the read is narrowed to relevance 10, the lowest bar a domain lane sets');
ok(f.$and[1].$or.some((c) => c.title instanceof RegExp && c.title.test("Founder's Office Intern")),
  "but a founder's office title is read whatever its relevance");
ok(f.$and[1].$or.some((c) => c.domain === 'product'), 'and so is a product role');

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
  ok(SHORTLIST_SIZE === 750 && SHORTLIST_SIZE / PAGE_SIZE === 15, `${SHORTLIST_SIZE} at ${PAGE_SIZE} a page is fifteen pages`);
}
ok(curate([job({ title: 'Spanish Search Quality Rater' })]).length === 0, 'an excluded title never reaches the list');

for (const t of [
  'AI Video Content For Lingerie Brand',
  'AI Video: Celebrity Dictator Parody',
  'Casino Games Associate Product Manager',
  'AVP - LoanIQ Business Analyst',
  'Director of AI Strategy',
  'Head of Growth',
  'Strategic Leadership Training course - Must be in Canada or US',
]) ok(isExcludedTitle(t), `excluded: "${t}"`);
for (const t of ["Kids' Stories & Grammar Worksheets", 'Updating AI Data Pipelines', 'Lead Generation Executive']) {
  ok(!isExcludedTitle(t), `kept: "${t}"`);
}

// ── lanes ───────────────────────────────────────────────────────────────────
// The first board was nearly all AI: 4 product roles and 18 founder's office
// roles cleared the single relevance gate, against 539 AI ones, and freelance
// was capped at five. These are what the lanes exist to fix.
{
  const shares = LANES.reduce((a, l) => a + l.share, 0);
  ok(Math.abs(shares - 1) < 1e-9, `lane shares sum to 1 (${shares})`);
  ok(new Set(LANES.map((l) => l.key)).size === LANES.length, 'no lane is listed twice');

  const lane = (over) => laneOf(job(over))?.key ?? null;
  ok(lane({ title: 'Associate Product Manager', domain: 'product' }) === 'product', 'a PM is product');
  ok(lane({ title: 'AI Product Engineer Intern', domain: 'ai-ml' }) === 'product', 'a product engineer joins product from any domain');
  ok(lane({ title: 'Product Engineer - Development Engineering', domain: 'software', company: 'Husky Injection Molding' }) !== 'product',
    'a factory product engineer is not a product role, even when only the employer says so');
  ok(lane({ title: "Founder's Office Intern", domain: 'data' }) === 'founders-office', "a founder's office title joins the lane from any domain");
  ok(lane({ title: 'Tour Consultant', domain: 'founders-office', relevance: 12 }) === null,
    "a generic consultant filed under founder's office needs syllabus evidence to join it");
  ok(lane({ title: 'AI Strategy Consultant', domain: 'founders-office', relevance: 40 }) === 'founders-office', 'and joins with it');
  ok(lane({ title: 'n8n Automation Developer Needed', domain: 'ai-generalist', workType: 'freelance' }) === 'freelance',
    'a freelance AI gig counts as freelance');
  ok(lane({ title: 'AI-Driven Keyword Strategy', domain: 'founders-office', workType: 'freelance', relevance: 50 }) === 'freelance',
    "a gig the pipeline filed under founder's office is still a gig");
  ok(lane({ domain: 'ai-ml' }) === 'ai' && lane({ domain: 'ai-generalist' }) === 'ai', 'both AI domains share the AI lane');
  ok(lane({ title: 'Graphic Designer', domain: 'design' }) === 'design', 'everything else by its domain');
  ok(lane({ domain: null, title: 'Mystery Role' }) === null, 'a job with no domain and no lane title is not placed');

  const ai = LANES.find((l) => l.key === 'ai');
  const product = LANES.find((l) => l.key === 'product');
  const design = LANES.find((l) => l.key === 'design');
  ok(!passesLane(job({ relevance: 29 }), ai) && passesLane(job({ relevance: 30 }), ai), 'the AI lane keeps the old bar of 30');
  ok(!passesLane(job({ relevance: 80, matchedSkills: [] }), ai), 'and still needs a matched syllabus term');
  ok(passesLane(job({ title: 'Associate Product Manager', relevance: 0, matchedSkills: [] }), product),
    'a product role needs no AI keyword - "Associate Product Manager" names none');
  ok(!passesLane(job({ domain: 'design', relevance: 14 }), design) && passesLane(job({ domain: 'design', relevance: 15 }), design),
    'design needs 15, so it is the AI-flavoured design work');
}

{
  // A flood of strong AI jobs cannot crowd out the rest.
  const aiFlood = Array.from({ length: 900 }, (_, i) => job({ title: `AI Engineer ${i}`, company: `AI Co ${i}`, relevance: 90 }));
  const pms = Array.from({ length: 10 }, (_, i) =>
    job({ title: `Associate Product Manager ${i}`, company: `PM Co ${i}`, domain: 'product', relevance: 0, matchedSkills: [] }));
  const list = curate([...aiFlood, ...pms]);
  ok(list.length === SHORTLIST_SIZE, 'the board is still full');
  ok(list.filter((j) => j.lane === 'product').length === 10, 'and every product role is on it, despite scoring far lower');

  // A lane short of its share does not leave the board short.
  const counts = laneCounts(list);
  ok(counts.ai === SHORTLIST_SIZE - 10, 'the unused shares go to the best of the rest');
}

{
  // Each lane stops at its share when every lane has plenty.
  const pool = [];
  for (const l of LANES) {
    for (let i = 0; i < 300; i++) {
      const base = { title: `${l.label} Associate ${i}`, company: `${l.key} ${i}`, relevance: 40 };
      if (l.key === 'product') pool.push(job({ ...base, title: `Product Manager ${i}`, domain: 'product' }));
      else if (l.key === 'founders-office') pool.push(job({ ...base, title: `Founder's Office Intern ${i}`, domain: 'founders-office' }));
      else if (l.key === 'freelance') pool.push(job({ ...base, title: `Freelance Designer ${i}`, workType: 'freelance', domain: 'design' }));
      else if (l.key === 'ai') pool.push(job({ ...base, domain: 'ai-ml' }));
      else pool.push(job({ ...base, domain: l.key }));
    }
  }
  const list = curate(pool);
  const counts = laneCounts(list);
  const targets = laneTargets(SHORTLIST_SIZE);
  ok([...targets.values()].reduce((a, b) => a + b, 0) === SHORTLIST_SIZE, 'the lane targets add up to the board exactly');
  ok(LANES.every((l) => counts[l.key] === targets.get(l.key)),
    `every lane gets exactly its share (${LANES.map((l) => `${l.key} ${counts[l.key]}`).join(', ')})`);

  // Interleaved: the first page is a cross-section, not the top of one lane.
  const firstPage = new Set(list.slice(0, PAGE_SIZE).map((j) => j.lane));
  ok(firstPage.size === LANES.length, `page one holds every lane (${firstPage.size} of ${LANES.length})`);
  const aiOnPageOne = list.slice(0, PAGE_SIZE).filter((j) => j.lane === 'ai').length;
  ok(aiOnPageOne >= 13 && aiOnPageOne <= 17, `and the AI lane in proportion to its share (${aiOnPageOne} of ${PAGE_SIZE})`);
}

{
  // Inside a lane, the explicit title leads.
  const list = curate([
    job({ title: 'Security Advisor', company: 'A', domain: 'founders-office', relevance: 30 }),
    job({ title: "Founder's Office Intern", company: 'B', domain: 'founders-office', relevance: 20 }),
  ]);
  ok(list[0]?.title === "Founder's Office Intern", `a founder's office title outranks a vaguer role with more AI words (+${TITLE_BOOST})`);
}

// ── marketplace gigs ────────────────────────────────────────────────────────
{
  const gigs = Array.from({ length: 12 }, (_, i) =>
    job({ title: `AI Chatbot Build ${i}`, company: null, source: 'freelancer', workType: 'freelance', url: `https://f.test/${i}` }));
  ok(curate(gigs).length === 12, 'twelve gigs from twelve unnamed clients are twelve employers, not one capped bucket');
  ok(menlerScore(gigs[0]) === menlerScore({ ...gigs[0], company: 'Acme' }), 'a marketplace gig carries no unnamed-employer penalty');
  ok(displayCompany(gigs[0]) === 'Client on Freelancer.com', 'and its card names the marketplace');
  ok(displayCompany(job({ company: 'null', source: 'indeed' })) === null, 'an unnamed job elsewhere still shows no employer');
  ok(displayCompany(job({ company: ' Acme ' })) === 'Acme', 'a named employer is shown as named');
}

// ── filters narrow within the 750 ───────────────────────────────────────────
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
