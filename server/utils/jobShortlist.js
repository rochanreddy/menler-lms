// Which 300 jobs a Menler student sees, and in what order.
//
// The feed holds ~25,000 live listings. Skeo shows all of them; Menler shows a
// shortlist, because a board of 25,000 is a search engine and what a student
// finishing the AI Generalist or the Kickstarter needs is an editor. Every
// rule below exists to make the 300 the RIGHT 300, not a random slice of the
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
 * A posting has to clear every one of these to be considered at all.
 *
 * Measured against the live board (24,927 listings): 856 pass, so the 300 are
 * chosen from nearly three times as many as are shown, and the floor of the
 * list is still a job worth a student's time.
 *
 *   relevance 30      below this a job has no real syllabus evidence - it is
 *                     on the board because its category is, not because of
 *                     anything in it
 *   indiaFit 40       excludes onsite-abroad (12) and visa or clearance gated
 *                     roles (8); keeps India (92), remote that hires from
 *                     India (86) and remote that does not say (48)
 *   achievability 30  excludes senior, lead, principal and 5+ years roles,
 *                     which a six-week programme does not bridge
 *   a syllabus term   at least one matched - the listing names something the
 *                     course actually teaches
 */
export const GATES = {
  minRelevance: 30,
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
 */
export const EXCLUDED_TITLE = [
  /\b(spanish|arabic|french|german|japanese|korean|portuguese|italian|dutch|mandarin|chinese|cantonese|russian|turkish|polish|swedish|norwegian|danish|finnish|hebrew|greek|czech|hungarian|romanian|thai|vietnamese|indonesian|malay|tagalog|filipino)\b/i,
  /\((usa|us|u\.s\.|uk|canada|eu|europe|australia|germany)\)|\b(us|usa|uk|eu)[\s-]only\b|\busds\b|\bus[\s-]based\b|\bnorth america\b|\blatam\b|\bemea\b/i,
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
 * Points off for a posting that names no employer. Not excluded, since some
 * are real roles from a recruiter, but a student cannot check who they would
 * be working for, so such a posting should not open the board. Before this
 * one sat at number two.
 */
export const UNNAMED_EMPLOYER_PENALTY = 8;

const hasEmployer = (job) => {
  const name = String(job.company || '').trim();
  return Boolean(name) && !/^(null|undefined|n\/?a|confidential)$/i.test(name);
};

/** How many listings the board ever shows. */
export const SHORTLIST_SIZE = 300;

/**
 * At most this many from one employer.
 *
 * Without it one company's recruiting push fills the list: in the raw top 300,
 * listings with no employer named took 45 slots, and Binance 8. Five keeps a
 * good employer visible without letting it crowd out forty others.
 */
export const PER_COMPANY = 5;

/** The Mongo filter for the candidate pool, before any arithmetic. */
export function candidateFilter(since) {
  return {
    isActive: { $ne: false },
    // The rolling window, the same one Skeo and the pipeline apply: posted in
    // the last ten days, or first seen then for the rare source with no date.
    $or: [{ postedAt: { $gte: since } }, { postedAt: null, fetchedAt: { $gte: since } }],
    relevance: { $gte: GATES.minRelevance },
    indiaFit: { $gte: GATES.minIndiaFit },
    achievability: { $gte: GATES.minAchievability },
    'matchedSkills.0': { $exists: true },
  };
}

const num = (v) => (Number.isFinite(v) ? v : 0);

/** The Menler score for one job: the four stored scores, syllabus first. */
export function menlerScore(job) {
  const weighted =
    num(job.relevance) * MENLER_WEIGHTS.relevance +
    num(job.achievability) * MENLER_WEIGHTS.achievability +
    num(job.indiaFit) * MENLER_WEIGHTS.indiaFit +
    num(job.easeOfApply) * MENLER_WEIGHTS.easeOfApply;
  const penalty = hasEmployer(job) ? 0 : UNNAMED_EMPLOYER_PENALTY;
  return Math.max(0, Math.round(weighted - penalty));
}

/** True when the title needs a language or a location the student lacks. */
export function isExcludedTitle(title) {
  const text = typeof title === 'string' ? title : '';
  return EXCLUDED_TITLE.some((pattern) => pattern.test(text));
}

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Two postings are the same job when the title and the employer match. The
 * feed lists one opening from several sources, and a curated list that shows
 * the same role three times has quietly shrunk to 298.
 */
export const sameJobKey = (job) => `${squash(job.title)}|${squash(job.company)}`;

/**
 * Picks the shortlist from the candidates.
 *
 * Order: best Menler score first, newest breaking ties. Then walked in that
 * order, keeping a posting only if it is not a duplicate of one already kept
 * and its employer is under the cap - so the version kept of a duplicate is
 * always the best-scoring one.
 */
export function curate(candidates, { size = SHORTLIST_SIZE, perCompany = PER_COMPANY } = {}) {
  const scored = candidates
    .filter((job) => !isExcludedTitle(job.title) && !isTopicOnlyTitle(job.title) && !isTiedAbroad(job))
    .map((job) => ({ ...job, menlerScore: menlerScore(job) }));

  scored.sort(
    (a, b) =>
      b.menlerScore - a.menlerScore ||
      new Date(b.postedAt || b.fetchedAt || 0) - new Date(a.postedAt || a.fetchedAt || 0),
  );

  const seen = new Set();
  const perEmployer = new Map();
  const picked = [];

  for (const job of scored) {
    if (picked.length >= size) break;

    const key = sameJobKey(job);
    if (seen.has(key)) continue;

    // An unnamed employer is one bucket, not a free pass: those listings are
    // the least verifiable on the board and were the largest single block of
    // the raw top 300.
    const employer = squash(job.company) || '(unnamed)';
    const count = perEmployer.get(employer) || 0;
    if (count >= perCompany) continue;

    seen.add(key);
    perEmployer.set(employer, count + 1);
    picked.push(job);
  }

  return picked;
}

/**
 * Narrows a list by the board's filters. Runs over the 300 in memory rather
 * than in Mongo, because the 300 is already in hand and a filter should
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

/** How many of the list fall in each domain, for the filter's counts. */
export function domainCounts(jobs) {
  const counts = {};
  for (const job of jobs) {
    if (job.domain) counts[job.domain] = (counts[job.domain] || 0) + 1;
  }
  return counts;
}
