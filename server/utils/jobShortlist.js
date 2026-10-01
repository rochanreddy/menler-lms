// Which 750 jobs a Menler student sees, and in what order.
//
// The feed holds ~35,000 live listings. Skeo shows all of them; Menler shows a
// shortlist, because a board of 35,000 is a search engine and what a student
// finishing the AI Generalist or the Kickstarter needs is an editor. Every
// rule below exists to make the 750 the RIGHT 750, not a random slice of the
// top of an unrelated sort.
//
// The pipeline stores four scores on every job (pipeline/ranking.js):
//
//   relevance      how well it matches the Menler syllabus (pipeline/syllabus.js)
//   achievability  could a graduate realistically get it
//   indiaFit       is it open to someone in India
//   easeOfApply    can they apply today
//
// Skeo sorts on the pipeline's own rankScore, which puts relevance LAST
// (0.12): right for a broad board where anything on-topic will do. It is
// wrong here. Menler teaches one thing - Claude-first AI generalist work - and
// a board that ranks a customer-service walk-in above an AI automation role
// because both are entry level in India is not a Menler board. So Menler
// recombines the same four stored scores with the syllabus first.
//
// LANES. The first version was one list of 300 sorted on that score, and it
// came out nearly all AI and ML: the syllabus vocabulary is AI vocabulary, so
// a product manager or a founder's office role scores low on relevance however
// good a first job it is. Measured on the live board, 4 product roles and 18
// founder's office roles cleared the old relevance gate, against 539 AI ones,
// and freelance gigs were cut to five by the unnamed-employer cap. But a
// Menler graduate goes into product, founder's office, freelance AI work and
// AI-heavy marketing and content as often as into an AI engineering title.
//
// So the 750 are filled lane by lane (LANES below). Each lane has a share of
// the board and its own relevance bar, and within a lane the Menler score
// still decides the order, so the AI-flavoured marketing role still beats the
// plain one. The lanes are then interleaved, so page one is a cross-section of
// the board rather than the top of whichever lane scores highest.
//
// Nothing here is recomputed from text. The four scores are stored, so this
// is one indexed read and some arithmetic, and it can never disagree with the
// pipeline about what a posting says.

/** The editorial weighting. Sums to 1, so the result stays on 0-100. */
export const MENLER_WEIGHTS = {
  relevance: 0.45,
  achievability: 0.25,
  indiaFit: 0.2,
  easeOfApply: 0.1,
};

/**
 * Every lane shares these two. Relevance is per lane (LANES), because the
 * syllabus score means something different for an AI role and a sales one.
 *
 *   indiaFit 40       excludes onsite-abroad (12) and visa or clearance gated
 *                     roles (8); keeps India (92), remote that hires from
 *                     India (86) and remote that does not say (48)
 *   achievability 30  excludes senior, lead, principal and 5+ years roles,
 *                     which a six-week programme does not bridge
 */
export const GATES = {
  minIndiaFit: 40,
  minAchievability: 30,
};

/**
 * Titles that need something the programme cannot give a student, and that
 * the stored scores do not see because the signal is only in the title.
 *
 * Measured: 19 of the 856 candidates are locked to a foreign language
 * ("Spanish Search Quality Rater", "AI tester with Arabic language") and 5
 * name a location abroad in the title ("(USA)", "USDS", "LATAM"). None of the
 * language-locked ones is based in India, so excluding them costs nothing.
 * Indian languages are deliberately absent from the list.
 *
 * The third line came with the freelance lane. A marketplace takes any client,
 * and among the gigs were adult-brand shoots, betting sites and deepfake
 * parodies of real people: nothing a programme should put in front of its
 * students under its own name.
 *
 * The fourth is seniority the pipeline's achievability score misses when the
 * rest of the posting reads junior: an "AVP - LoanIQ Business Analyst" scored
 * 50 and reached the list.
 */
export const EXCLUDED_TITLE = [
  /\b(spanish|arabic|french|german|japanese|korean|portuguese|italian|dutch|mandarin|chinese|cantonese|russian|turkish|polish|swedish|norwegian|danish|finnish|hebrew|greek|czech|hungarian|romanian|thai|vietnamese|indonesian|malay|tagalog|filipino)\b/i,
  /\((usa|us|u\.s\.|uk|canada|eu|europe|australia|germany)\)|\b(us|usa|uk|eu)[\s-]only\b|\busds\b|\bus[\s-]based\b|\bnorth america\b|\blatam\b|\bemea\b|\bmust be (based |located )?in (the )?(us|usa|united states|canada|uk|europe|australia)\b/i,
  /\b(lingerie|adult|nsfw|onlyfans|erotic|escort|dating|casino|gambling|betting|parody|deepfake)\b/i,
  /\b(avp|svp|evp|vp|vice president|director|head of)\b/i,
];

/**
 * A non-Indian job is only kept when its location says nothing, or says
 * "anywhere". A location naming a place abroad means the role is tied there.
 *
 * The pipeline scores a remote posting with no stated restriction as 48 on
 * indiaFit, "remote, location unstated". Checked against the live board, 61 of
 * the first 300 were remote postings whose LOCATION field said "Portland, OR,
 * US", "Toronto, ON, CA", "United States" or "Hong Kong, Singapore, Taiwan":
 * restricted in all but name, and a fifth of the list closed to an Indian
 * student. So the location has to consist ONLY of these words - "Remote",
 * "Anywhere in the World", "Worldwide" - for an abroad role to count as open.
 * "Remote, US" does not pass: the US is the restriction.
 */
const OPEN_LOCATION_WORDS = new Set([
  'remote', 'anywhere', 'worldwide', 'global', 'globally', 'in', 'the', 'world',
  'work', 'from', 'home', 'wfh', 'fully', 'first', 'distributed', 'earth', 'location', 'any',
]);

export function isTiedAbroad(job) {
  if (job.country === 'India') return false;
  const location = String(job.location || '').toLowerCase();
  if (!location.trim() || /\bindia\b/.test(location)) return false;
  const words = location.split(/[^a-z]+/).filter(Boolean);
  return words.some((word) => !OPEN_LOCATION_WORDS.has(word));
}

/**
 * A title that is only a topic, like "generative AI". These are listings
 * whose real title was lost somewhere upstream, often a search keyword stored
 * in its place, and a student cannot tell from one what the job is.
 *
 * Deliberately narrow: three words or fewer AND no word naming a role.
 * Measured, 26 of the first 300 had no role word at all, and most were real -
 * "Woman Returnship - Gen AI", "AI Architecture Fellowship" - so the length
 * limit is what keeps this from cutting real openings.
 */
const ROLE_WORD =
  /\b(engineer|engineering|developer|intern|internship|analyst|manager|specialist|designer|writer|creator|trainer|trianer|tutor|associate|lead|consultant|scientist|architect|executive|officer|coordinator|strategist|tester|researcher|annotator|rater|evaluator|editor|marketer|representative|assistant|expert|programmer|administrator|operator|head|director|founder|fellow|fellowship|apprentice|trainee|fresher|builder|producer|artist|agent|advocate|partner|instructor|teacher|educator|mentor|coach|generalist|professional|returnship|programme|program)\b/i;

export function isTopicOnlyTitle(title) {
  const text = String(title || '').trim();
  if (!text) return true;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= 3 && !ROLE_WORD.test(text);
}

/**
 * Sources that are marketplaces: each listing is a different client's gig,
 * and the client is never named. The marketplace is what a student checks
 * (its reviews, its escrow), so a gig there is not "unnamed" the way a
 * recruiter's anonymous post is - it carries no penalty, and each gig is its
 * own employer for the cap. Without this all 3,000 Freelancer.com gigs shared
 * one five-slot bucket, and the board had five freelance jobs.
 */
export const MARKETPLACES = {
  freelancer: 'Client on Freelancer.com',
};

/**
 * Points off for a posting that names no employer. Not excluded, since some
 * are real roles from a recruiter, but a student cannot check who they would
 * be working for, so such a posting should not open the board. Before this
 * one sat at number two.
 */
export const UNNAMED_EMPLOYER_PENALTY = 8;

const hasEmployer = (job) => {
  const name = String(job.company ?? '').trim();
  return Boolean(name) && !/^(null|undefined|n\/?a|confidential)$/i.test(name);
};

const isMarketplaceGig = (job) => !hasEmployer(job) && Object.hasOwn(MARKETPLACES, job.source || '');

/** The name a card shows: the employer, or the marketplace for a gig. */
export function displayCompany(job) {
  if (hasEmployer(job)) return String(job.company).trim();
  return isMarketplaceGig(job) ? MARKETPLACES[job.source] : null;
}

/** How many listings the board ever shows. Fifteen pages of fifty. */
export const SHORTLIST_SIZE = 750;

/**
 * At most this many from one employer.
 *
 * Without it one company's recruiting push fills the list: in the raw top 300,
 * listings with no employer named took 45 slots, and Binance 8. Five keeps a
 * good employer visible without letting it crowd out forty others.
 */
export const PER_COMPANY = 5;

/**
 * Points a lane adds when the title says outright that the job is the lane's
 * kind of job - "Founder's Office Intern", "Associate Product Manager". The
 * domain classifier files some of these elsewhere and the syllabus score
 * rates most of them low, so without it a vaguely related role with an AI
 * word in it would outrank the real thing inside its own lane.
 */
export const TITLE_BOOST = 15;

/**
 * A product role a software-and-AI course leads to. "Product engineer" in a
 * factory is a different job - Husky's injection-moulding product engineers
 * were on the live board - so a hardware title, or a hardware employer when
 * the title does not say, never counts.
 */
const PRODUCT_TITLE =
  /\bproduct (manager|management|owner|analyst|engineer|engineering|associate|intern|internship|designer|specialist|operations|ops|lead|strategist)\b|\b(apm|associate product)\b/i;
const NOT_SOFTWARE_PRODUCT =
  /\b(mechanical|hardware|electrical|electronics?|injection|moulding|molding|automotive|semiconductor|silicon|insurance|benefits|pharma\w*|medical affairs|textile|apparel|agri\w*|seeding|planting)\b/i;

/**
 * A founder's office role by name. Deliberately not "business analyst": that
 * title is mostly an enterprise requirements job - Guidewire, LoanIQ - and
 * when it was here those crowded out the founder's office interns they share
 * nothing with. Business analysts stay on the board through the data lane.
 */
const FOUNDERS_TITLE =
  /\bfounder'?s'? office\b|\bfounders? (associate|intern|staff)\b|\bchief of staff\b|\bstrategy (intern|analyst|associate)\b|\bgrowth (intern|associate|analyst)\b|\bentrepreneur in residence\b|\bspecial projects\b|\bbizops\b|\bbusiness operations (intern|associate|analyst)\b/i;

/**
 * The pipeline files every generic consultant and strategist under founder's
 * office, so on the live board that domain held tour consultants and security
 * advisors next to the real thing. Without the title, a job in the domain has
 * to show some syllabus evidence to join the lane.
 */
const FOUNDERS_DOMAIN_MIN_RELEVANCE = 15;

const num = (v) => (Number.isFinite(v) ? v : 0);

const isProductRole = (job) =>
  !NOT_SOFTWARE_PRODUCT.test(`${job.title || ''} ${job.company || ''}`) &&
  (job.domain === 'product' || PRODUCT_TITLE.test(job.title || ''));

/**
 * The board, by kind of job. A job joins the FIRST lane it matches, so a
 * freelance AI gig counts as freelance and an AI product manager as product.
 *
 *   share         its part of the 750; the shares sum to 1
 *   minRelevance  its own syllabus bar. 30 for the AI lane, as before. 15 for
 *                 the work the course feeds into, where it means "names an AI
 *                 tool or skill" and keeps the AI-flavoured ones. 10 for sales
 *                 and operations. 0 for product and founder's office, whose
 *                 best openings - "Associate Product Manager" - often name no
 *                 tool at all: there the gates and the title do the work (a
 *                 founder's office job without the title still needs 15).
 *   needsSkill    at least one matched syllabus term (AI lane only)
 *   title         its explicit titles, which join the lane from any domain
 *                 and earn TITLE_BOOST inside it
 *
 * A lane short of its share does not leave a hole: curate() fills the rest
 * of the 750 from the best jobs left over in any lane.
 */
export const LANES = [
  { key: 'product', label: 'Product', share: 0.08, minRelevance: 0, title: PRODUCT_TITLE, match: isProductRole },
  {
    key: 'founders-office',
    label: "Founder's Office",
    share: 0.08,
    minRelevance: 0,
    title: FOUNDERS_TITLE,
    match: (job) =>
      FOUNDERS_TITLE.test(job.title || '') ||
      (job.domain === 'founders-office' &&
        job.workType !== 'freelance' &&
        num(job.relevance) >= FOUNDERS_DOMAIN_MIN_RELEVANCE),
  },
  { key: 'freelance', label: 'Freelance', share: 0.15, minRelevance: 15, match: (job) => job.workType === 'freelance' },
  {
    key: 'ai',
    label: 'AI',
    share: 0.3,
    minRelevance: 30,
    needsSkill: true,
    match: (job) => job.domain === 'ai-ml' || job.domain === 'ai-generalist',
  },
  { key: 'software', label: 'Full Stack', share: 0.09, minRelevance: 15, match: (job) => job.domain === 'software' },
  { key: 'data', label: 'Data', share: 0.05, minRelevance: 15, match: (job) => job.domain === 'data' },
  { key: 'design', label: 'Design', share: 0.06, minRelevance: 15, match: (job) => job.domain === 'design' },
  { key: 'marketing', label: 'Marketing', share: 0.06, minRelevance: 15, match: (job) => job.domain === 'marketing' },
  { key: 'content', label: 'Content', share: 0.05, minRelevance: 15, match: (job) => job.domain === 'content' },
  { key: 'sales', label: 'Sales', share: 0.04, minRelevance: 10, match: (job) => job.domain === 'sales' },
  { key: 'operations', label: 'Operations', share: 0.04, minRelevance: 10, match: (job) => job.domain === 'operations' },
];

/**
 * How many places each lane gets on a board of `size`. Largest remainder, so
 * they add up to `size` exactly: rounding each share on its own gives 752 for
 * a board of 750, and the last lane in the list would quietly lose two.
 */
export function laneTargets(size, lanes = LANES) {
  const exact = lanes.map((lane) => ({ key: lane.key, raw: lane.share * size }));
  const targets = new Map(exact.map((e) => [e.key, Math.floor(e.raw)]));
  let spare = size - [...targets.values()].reduce((a, b) => a + b, 0);
  for (const e of [...exact].sort((a, b) => (b.raw % 1) - (a.raw % 1))) {
    if (spare <= 0) break;
    targets.set(e.key, targets.get(e.key) + 1);
    spare -= 1;
  }
  return targets;
}

/** The lane a job belongs to, or null when it fits none. */
export function laneOf(job, lanes = LANES) {
  return lanes.find((lane) => lane.match(job)) || null;
}

/** True when a job clears its lane's own bar. */
export function passesLane(job, lane) {
  if (!lane) return false;
  if (num(job.relevance) < lane.minRelevance) return false;
  if (lane.needsSkill && !job.matchedSkills?.length) return false;
  return true;
}

/**
 * The Mongo filter for the candidate pool, before any arithmetic.
 *
 * The lanes decide the rest in memory, but the read is narrowed to what some
 * lane could take, so it does not haul back the thousands of walk-ins no lane
 * wants: a relevance of 10, the lowest bar a domain lane sets, or a product
 * role or a founder's office title, whose lanes set none.
 */
export function candidateFilter(since) {
  const lowestBar = Math.min(...LANES.filter((lane) => lane.minRelevance > 0).map((lane) => lane.minRelevance));
  return {
    isActive: { $ne: false },
    indiaFit: { $gte: GATES.minIndiaFit },
    achievability: { $gte: GATES.minAchievability },
    $and: [
      // The rolling window, the same one Skeo and the pipeline apply: posted in
      // the last ten days, or first seen then for the rare source with no date.
      { $or: [{ postedAt: { $gte: since } }, { postedAt: null, fetchedAt: { $gte: since } }] },
      {
        $or: [
          { relevance: { $gte: lowestBar } },
          { domain: 'product' },
          { title: PRODUCT_TITLE },
          { title: FOUNDERS_TITLE },
        ],
      },
    ],
  };
}

/** The Menler score for one job: the four stored scores, syllabus first. */
export function menlerScore(job) {
  const weighted =
    num(job.relevance) * MENLER_WEIGHTS.relevance +
    num(job.achievability) * MENLER_WEIGHTS.achievability +
    num(job.indiaFit) * MENLER_WEIGHTS.indiaFit +
    num(job.easeOfApply) * MENLER_WEIGHTS.easeOfApply;
  const penalty = hasEmployer(job) || isMarketplaceGig(job) ? 0 : UNNAMED_EMPLOYER_PENALTY;
  return Math.max(0, Math.round(weighted - penalty));
}

/** True when the title needs a language or a location the student lacks. */
export function isExcludedTitle(title) {
  const text = typeof title === 'string' ? title : '';
  return EXCLUDED_TITLE.some((pattern) => pattern.test(text));
}

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Two postings are the same job when the title and the employer match. The
 * feed lists one opening from several sources, and a curated list that shows
 * the same role three times has quietly shrunk.
 */
export const sameJobKey = (job) => `${squash(job.title)}|${squash(hasEmployer(job) ? job.company : '')}`;

/** Who a job counts against for PER_COMPANY. */
function employerKey(job) {
  // A marketplace gig is one client's; two gigs are two clients.
  if (isMarketplaceGig(job)) return `${job.source}:${job.url || squash(job.title)}`;
  // An unnamed employer is one bucket, not a free pass: those listings are
  // the least verifiable on the board and were the largest single block of
  // the raw top 300.
  return hasEmployer(job) ? squash(job.company) : '(unnamed)';
}

const newest = (job) => new Date(job.postedAt || job.fetchedAt || 0).getTime();

/**
 * Picks the shortlist from the candidates.
 *
 *   1. Each job is put in its lane and has to clear that lane's bar.
 *   2. Each lane takes its best, up to its share of `size`, in lane order:
 *      Menler score plus TITLE_BOOST for an explicit title, newest on a tie.
 *   3. Whatever the lanes left empty - a lane short of jobs - is filled from
 *      the best of the rest, on Menler score alone.
 *   4. The lanes are interleaved, so every page is a cross-section.
 *
 * Throughout, a duplicate of a job already kept is skipped and an employer
 * stops at `perCompany`, so the version kept of a duplicate is always the
 * best-scoring one.
 */
export function curate(candidates, { size = SHORTLIST_SIZE, perCompany = PER_COMPANY, lanes = LANES } = {}) {
  const eligible = [];
  for (const job of candidates) {
    if (isExcludedTitle(job.title) || isTopicOnlyTitle(job.title) || isTiedAbroad(job)) continue;
    const lane = laneOf(job, lanes);
    if (!passesLane(job, lane)) continue;
    const score = menlerScore(job);
    const boost = lane.title?.test(job.title || '') ? TITLE_BOOST : 0;
    eligible.push({ ...job, lane: lane.key, menlerScore: score, laneScore: score + boost });
  }

  const target = laneTargets(size, lanes);
  const inLane = new Map(lanes.map((lane) => [lane.key, []]));
  const seen = new Set();
  const perEmployer = new Map();
  let count = 0;

  const take = (job) => {
    const key = sameJobKey(job);
    if (seen.has(key)) return false;
    const employer = employerKey(job);
    const used = perEmployer.get(employer) || 0;
    if (used >= perCompany) return false;
    seen.add(key);
    perEmployer.set(employer, used + 1);
    inLane.get(job.lane).push(job);
    count += 1;
    return true;
  };

  // Each lane to its share.
  eligible.sort((a, b) => b.laneScore - a.laneScore || newest(b) - newest(a));
  const leftover = [];
  for (const job of eligible) {
    if (count >= size) break;
    if (inLane.get(job.lane).length >= target.get(job.lane) || !take(job)) leftover.push(job);
  }

  // The places a short lane could not fill, to the best of the rest.
  leftover.sort((a, b) => b.menlerScore - a.menlerScore || newest(b) - newest(a));
  for (const job of leftover) {
    if (count >= size) break;
    take(job);
  }

  // Interleave: each job sits at its relative depth in its own lane, so the
  // first page holds the top few of every lane in proportion, not the whole
  // of the strongest one.
  const placed = [];
  for (const list of inLane.values()) {
    list.forEach((job, i) => placed.push({ job, at: (i + 0.5) / list.length }));
  }
  placed.sort((a, b) => a.at - b.at || b.job.menlerScore - a.job.menlerScore);
  return placed.map((p) => p.job);
}

/** How many of a list sit in each lane. */
export function laneCounts(jobs) {
  const counts = {};
  for (const job of jobs) if (job.lane) counts[job.lane] = (counts[job.lane] || 0) + 1;
  return counts;
}

/**
 * Narrows a list by the board's filters. Runs over the 750 in memory rather
 * than in Mongo, because the 750 is already in hand and a filter should
 * narrow the shortlist, not re-open the whole feed behind it.
 */
export function applyFilters(jobs, f) {
  const search = (f.search || '').toLowerCase();

  return jobs.filter((job) => {
    if (f.domains.length && !f.domains.includes(job.domain)) return false;
    if (f.workTypes.length && !f.workTypes.includes(job.workType || 'unspecified')) return false;
    if (f.levels.length && !f.levels.includes(job.experienceLevel || 'unspecified')) return false;

    if (f.places.length) {
      const inIndia = job.country === 'India';
      const matches =
        (f.places.includes('india') && inIndia) || (f.places.includes('remote') && job.isRemote);
      if (!matches) return false;
    }

    if (search) {
      const haystack = `${job.title || ''} ${job.company || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

/**
 * Counts for every filter chip, each one computed with the OTHER filters
 * applied and its own left off.
 *
 * So with Design picked, "Internship 3" means three design internships, not
 * the 37 internships across the whole board. A count that ignores what is
 * already chosen promises results the click will not deliver; one that
 * respects it means a chip never leads to an empty page.
 */
export function facetCounts(jobs, f) {
  const without = (over) => applyFilters(jobs, { ...f, ...over });
  const tally = (list, key) => {
    const counts = {};
    for (const job of list) {
      const value = job[key] || 'unspecified';
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  };

  const forDomain = without({ domains: [] });
  const forLevel = without({ levels: [] });
  const forType = without({ workTypes: [] });
  const forPlace = without({ places: [] });

  return {
    domains: tally(forDomain, 'domain'),
    domainTotal: forDomain.length,
    levels: tally(forLevel, 'experienceLevel'),
    levelTotal: forLevel.length,
    workTypes: tally(forType, 'workType'),
    workTypeTotal: forType.length,
    remote: forPlace.filter((job) => job.isRemote).length,
    india: forPlace.filter((job) => job.country === 'India').length,
    placeTotal: forPlace.length,
  };
}

/** How many of the list fall in each domain, for the filter's counts. */
export function domainCounts(jobs) {
  const counts = {};
  for (const job of jobs) {
    if (job.domain) counts[job.domain] = (counts[job.domain] || 0) + 1;
  }
  return counts;
}
