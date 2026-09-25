import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { JobPosting } from '../models/JobPosting.js';
import { ScrapedJob } from '../models/ScrapedJob.js';
import {
  DOMAINS,
  WORK_TYPES,
  EXPERIENCE_LEVELS,
  PLACES,
  isDomain,
  isWorkType,
  isExperienceLevel,
  isPlace,
} from '../utils/jobTaxonomy.js';
import {
  SHORTLIST_SIZE,
  candidateFilter,
  curate,
  applyFilters,
  facetCounts,
} from '../utils/jobShortlist.js';

const router = Router();

// The job board: Students and admins. Mentors get no tab - they are not job
// hunting, and a board a student reads is not one a mentor needs to police.
//
// Not the whole feed. utils/jobShortlist.js picks the 300 postings that best
// fit what Menler teaches, and the board is those 300 - six pages of fifty -
// with every filter narrowing within them rather than reaching back into the
// 25,000 behind. See that file for how the 300 are chosen.

/** A job shows for its first FRESH_DAYS days. Mirrors the pipeline and Skeo. */
export const FRESH_DAYS = 10;
export const PAGE_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const freshSince = () => new Date(Date.now() - FRESH_DAYS * DAY_MS);

/**
 * How long a computed shortlist is reused.
 *
 * The feed changes once a day, when the pipeline runs at 6 am, so recomputing
 * on every page flip would be work for nothing. Ten minutes means a student
 * paging through six pages sees one consistent list, and a fresh morning run
 * is on the board within ten minutes of landing.
 */
const CACHE_MS = 10 * 60 * 1000;

// The last shortlist, and the request computing the next one. Holding the
// promise means a cold cache hit by several students at once runs one query,
// not one each.
let cached = { at: 0, jobs: null };
let inFlight = null;

/** Only what the shortlist and the card read, so a few hundred rows stay small. */
const FIELDS =
  'title company companyLogo location country isRemote url source domain workType ' +
  'experienceLevel relevance achievability indiaFit easeOfApply rankReasons matchedSkills ' +
  'postedAt fetchedAt';

async function loadShortlist() {
  const Scraped = ScrapedJob();
  if (!Scraped) return null;

  if (cached.jobs && Date.now() - cached.at < CACHE_MS) return cached.jobs;
  if (inFlight) return inFlight;

  inFlight = Scraped.find(candidateFilter(freshSince()), FIELDS)
    .lean()
    .then((candidates) => {
      const jobs = curate(candidates);
      cached = { at: Date.now(), jobs };
      return jobs;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Keeps only values the taxonomy knows. These arrive off a query string, where
 * `?domain[$ne]=x` arrives as an object rather than a value; whitelisting
 * closes that, and means a typo narrows nothing instead of emptying the board.
 */
function clean(input, isValid) {
  const raw = Array.isArray(input) ? input : [input];
  const flat = raw
    .filter((v) => typeof v === 'string')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(flat.filter(isValid))];
}

/** Parses the board's filters. Exported for scripts/testJobs.mjs. */
export function parseFilters(query = {}) {
  const page = Number.parseInt(query.page, 10);
  return {
    domains: clean(query.domain, isDomain),
    workTypes: clean(query.workType, isWorkType),
    levels: clean(query.experience, isExperienceLevel),
    places: clean(query.place, isPlace),
    search: typeof query.search === 'string' ? query.search.trim().slice(0, 120) : '',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** True for an absolute http(s) URL, the only kind a card links to. */
export function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** One shape for the client, whichever half a listing came from. */
const shapeScraped = (job) => ({
  id: String(job._id),
  title: job.title,
  company: job.company,
  // Only an http(s) logo reaches an <img src>. The pipeline already filters,
  // and this is the second check on a string that came from a third party.
  companyLogo: isHttpUrl(job.companyLogo) ? job.companyLogo : null,
  location: job.location,
  country: job.country,
  isRemote: Boolean(job.isRemote),
  url: isHttpUrl(job.url) ? job.url : null,
  domain: job.domain || null,
  workType: job.workType || 'unspecified',
  experienceLevel: job.experienceLevel || 'unspecified',
  postedAt: job.postedAt || job.fetchedAt || null,
  // Why it made the 300 - "internship · Bengaluru · direct apply · matches
  // claude". Without it a curated list looks like an arbitrary one.
  reasons: job.rankReasons?.length ? job.rankReasons : job.matchedSkills || [],
  description: '',
  origin: 'feed',
});

const shapeManual = (job) => ({
  id: String(job._id),
  title: job.title,
  company: job.company,
  companyLogo: null,
  location: job.location,
  country: /india|bengaluru|bangalore|mumbai|delhi|pune|hyderabad|chennai/i.test(job.location || '') ? 'India' : null,
  isRemote: Boolean(job.isRemote),
  url: isHttpUrl(job.applyUrl) ? job.applyUrl : null,
  domain: job.domain || null,
  workType: job.workType || 'unspecified',
  experienceLevel: job.experienceLevel || 'unspecified',
  postedAt: job.postedAt || job.createdAt,
  reasons: [],
  description: job.description || '',
  origin: 'manual',
});

// GET /api/lms/jobs - the board. The same list for a student and an admin.
router.get('/', requireAuth, requireRole('student', 'admin'), async (req, res) => {
  const filters = parseFilters(req.query);

  // The team's own postings lead. There are a handful of them, and they are
  // the ones somebody chose to put in front of these particular students. They
  // count toward the 300, so the board never grows past it.
  const manualRows = await JobPosting.find({ postedAt: { $gte: freshSince() } })
    .sort({ postedAt: -1 })
    .limit(50)
    .lean();
  const manual = manualRows.map(shapeManual);

  let feed = [];
  let feedAvailable = true;
  try {
    const shortlist = await loadShortlist();
    if (shortlist === null) feedAvailable = false;
    else feed = shortlist.slice(0, Math.max(SHORTLIST_SIZE - manual.length, 0)).map(shapeScraped);
  } catch (err) {
    // The feed is on another cluster. If it is unreachable the board still
    // shows what the LMS holds, and says why it looks thin.
    console.error('Job feed unavailable:', err.message);
    feedAvailable = false;
  }

  const all = [...manual, ...feed];
  const matching = applyFilters(all, filters);

  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const start = (page - 1) * PAGE_SIZE;

  // Each chip's count is taken with the other filters applied, so a chip
  // never promises results its click will not deliver.
  const counts = facetCounts(all, filters);
  const withCount = (list, tally) => list.map((o) => ({ ...o, count: tally[o.value] || 0 }));

  res.json({
    jobs: matching.slice(start, start + PAGE_SIZE),
    total: matching.length,
    shortlistSize: all.length,
    page,
    pages,
    pageSize: PAGE_SIZE,
    feedAvailable,
    refreshedAt: cached.at ? new Date(cached.at) : null,
    facets: {
      domains: withCount(DOMAINS, counts.domains),
      domainTotal: counts.domainTotal,
      levels: withCount(EXPERIENCE_LEVELS, counts.levels),
      levelTotal: counts.levelTotal,
      workTypes: withCount(WORK_TYPES, counts.workTypes),
      workTypeTotal: counts.workTypeTotal,
      places: PLACES,
      remote: counts.remote,
      india: counts.india,
      placeTotal: counts.placeTotal,
    },
  });
});

// POST /api/lms/jobs - an admin adds an opening by hand.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, company, location, applyUrl, description, domain, workType, experienceLevel, isRemote } =
    req.body || {};

  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (typeof company !== 'string' || !company.trim()) return res.status(400).json({ error: 'Company is required.' });

  // This becomes the href on the card's Apply button, so a javascript: or
  // data: value would be a script a student clicks. Only http(s) goes in.
  const link = typeof applyUrl === 'string' ? applyUrl.trim() : '';
  if (link && !isHttpUrl(link)) {
    return res.status(400).json({ error: 'The apply link has to start with http:// or https://.' });
  }

  const job = await JobPosting.create({
    title: title.trim(),
    company: company.trim(),
    location: typeof location === 'string' ? location.trim() : '',
    isRemote: Boolean(isRemote),
    applyUrl: link,
    description: typeof description === 'string' ? description.trim() : '',
    domain: isDomain(domain) ? domain : null,
    workType: isWorkType(workType) ? workType : 'unspecified',
    experienceLevel: isExperienceLevel(experienceLevel) ? experienceLevel : 'unspecified',
    postedAt: new Date(),
    postedBy: req.user?._id || null,
  });

  res.status(201).json({ job: shapeManual(job.toObject()) });
});

// DELETE /api/lms/jobs/:id - removes a hand-posted opening.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Not found.' });
  }

  const removed = await JobPosting.findByIdAndDelete(req.params.id);

  // A scraped listing has no record in this database, so a miss almost always
  // means someone tried to remove one. Say so rather than reporting success.
  if (!removed) {
    return res.status(404).json({
      error: 'Not found. Listings from the feed cannot be removed here - they drop off on their own.',
    });
  }

  res.json({ ok: true });
});

export default router;
