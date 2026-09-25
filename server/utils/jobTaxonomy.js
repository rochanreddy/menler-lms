// The vocabularies a job is tagged with.
//
// A copy of pipeline/taxonomy.js in skeo-job-pipeline, which is the source of
// truth: its classifiers produce these values, and they are what is stored on
// every scraped job. When one is added or renamed it changes there first, then
// here - the same arrangement Skeo LMS has with its own copy. A plain copy
// rather than a shared package, because the repos deploy separately and a
// published package for three short lists would cost more than it saves.
//
// Stored values are slugs, never labels. Labels change when someone dislikes
// the wording, and rewriting thousands of rows over a copy edit should not be
// possible.

// The function of the job - what a student browses by. Filed by the
// pipeline's pipeline/domain.js from the title and category.
export const DOMAINS = [
  { value: 'ai-ml', label: 'AI & Machine Learning' },
  { value: 'ai-generalist', label: 'AI Generalist & Automation' },
  { value: 'software', label: 'Full Stack & Software' },
  { value: 'data', label: 'Data & Analytics' },
  { value: 'product', label: 'Product' },
  { value: 'founders-office', label: "Founder's Office & Strategy" },
  { value: 'design', label: 'Design & Creative' },
  { value: 'marketing', label: 'Marketing & Growth' },
  { value: 'content', label: 'Content & Writing' },
  { value: 'sales', label: 'Sales & Customer Success' },
  { value: 'operations', label: 'Operations, HR & Finance' },
];

// How the work is engaged. `unspecified` is a real answer: most boards never
// say, and defaulting to full-time because it is the common case would put
// wrong information on a listing.
export const WORK_TYPES = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'internship', label: 'Internship' },
  { value: 'unspecified', label: 'Not specified' },
];

export const EXPERIENCE_LEVELS = [
  { value: 'internship', label: 'Internship' },
  { value: 'entry', label: 'Entry level' },
  { value: 'mid', label: 'Mid level' },
  { value: 'senior', label: 'Senior' },
  { value: 'unspecified', label: 'Not specified' },
];

export const PLACES = [
  { value: 'india', label: 'India' },
  { value: 'remote', label: 'Remote' },
];

export const DOMAIN_VALUES = DOMAINS.map((d) => d.value);
export const WORK_TYPE_VALUES = WORK_TYPES.map((w) => w.value);
export const EXPERIENCE_LEVEL_VALUES = EXPERIENCE_LEVELS.map((e) => e.value);
export const PLACE_VALUES = PLACES.map((p) => p.value);

export const isDomain = (v) => DOMAIN_VALUES.includes(v);
export const isWorkType = (v) => WORK_TYPE_VALUES.includes(v);
export const isExperienceLevel = (v) => EXPERIENCE_LEVEL_VALUES.includes(v);
export const isPlace = (v) => PLACE_VALUES.includes(v);
