// Small inline stroke-icon set for the sidebar. Keyed by nav label so nav.jsx
// stays icon-agnostic. Falls back to a dot for anything unmapped.
const P = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  home: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  learning: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 0 20 18.5z" /></>,
  library: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  forum: <><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" /></>,
  jobs: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  programs: <><path d="M12 3 3 8l9 5 9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 16l9 5 9-5" /></>,
  batches: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" /><path d="M17 5.2a3.5 3.5 0 0 1 0 6.6" /><path d="M18.5 20c0-2.4-1.2-4.3-3-5.2" /></>,
  mentors: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /><path d="m17 11 1.5 1.5L21 10" /></>,
  webinar: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></>,
  applicants: <><circle cx="10" cy="8" r="3.5" /><path d="M3 20c0-3.6 3.1-6 7-6 1.2 0 2.3.2 3.3.6" /><path d="M16 15h5" /><path d="M18.5 12.5v5" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  post: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
};

const ALIAS = {
  'Home': 'home', 'Learning': 'learning', 'Library': 'library', 'Forum': 'forum',
  'Job Board': 'jobs', 'Profile': 'profile', 'Programs': 'programs', 'Batches': 'batches',
  'Mentors': 'mentors', 'Students': 'batches', 'Webinar': 'webinar', 'Applicants': 'applicants', 'Account': 'account',
  'Post a Job': 'post',
};

export default function Icon({ name }) {
  const key = PATHS[name] ? name : ALIAS[name];
  return <svg {...P} aria-hidden="true">{PATHS[key] || <circle cx="12" cy="12" r="3" />}</svg>;
}
