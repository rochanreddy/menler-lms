import Placeholder from './components/Placeholder.jsx';
import Profile from './pages/Profile.jsx';
import Learning from './pages/Learning.jsx';
import ProgramsManage from './pages/ProgramsManage.jsx';
import StudentHome from './pages/StudentHome.jsx';
import AdminBatches from './pages/admin/Batches.jsx';
import AdminMentors from './pages/admin/Mentors.jsx';
import MentorBatches from './pages/mentor/Batches.jsx';
import MentorHome from './pages/mentor/Home.jsx';

// A placeholder page factory — renders the spec's sections for screens whose
// backend is Phase 2.
const ph = (title, sections, blurb) => () => <Placeholder title={title} sections={sections} blurb={blurb} />;

const S = (title, detail) => ({ title, detail });

// Each role's nav tabs. path '' is the index (Home). label drives the sidebar;
// Component drives the route. Kept in one place so nav + routing never drift.
export function navFor(role) {
  switch (role) {
    case 'student':
      return [
        { label: 'Home', path: '', Component: StudentHome },
        { label: 'Learning', path: 'learning', Component: Learning },
        { label: 'Library', path: 'library', Component: ph('Library', [
          S('PPTs', 'Slide decks per session'), S('eBooks', 'Downloadable books'),
          S('Learning Content', 'Notes & handouts'), S('Menler Library', 'Curated exclusive material'),
        ], 'Exclusive downloadable material, gated by enrollment.') },
        { label: 'Forum', path: 'forum', Component: ph('Forum', [
          S('Announcements', 'Pinned posts from mentors/admin (default view)'),
          S('Doubts', 'Post a question, threaded replies'),
          S('Chat', 'Batch group chat — open only around class windows'),
        ]) },
        { label: 'Job Board', path: 'jobs', Component: ph('Job Board', [
          S('Openings', 'Scraped / manual / partner-posted, with filters'),
          S('My Applications', 'Track application status'),
        ]) },
        { label: 'Profile', path: 'profile', Component: Profile },
      ];
    case 'mentor':
      return [
        { label: 'Home', path: '', Component: MentorHome },
        { label: 'Learning', path: 'learning', Component: Learning },
        { label: 'Programs', path: 'programs', Component: MentorBatches },
        { label: 'Forum', path: 'forum', Component: ph('Forum', [
          S('Announcements', 'Post & manage'), S('Doubts', 'Answer'), S('Chat', 'Moderate batch chat'),
        ]) },
        { label: 'Webinar', path: 'webinar', Component: ph('Webinar', [
          S('Past / Current', 'List of webinars'),
          S('Content · PPT · Feedback', 'View attendee feedback + recording'),
        ]) },
        { label: 'Profile', path: 'profile', Component: Profile },
      ];
    case 'admin':
      return [
        { label: 'Home', path: '', Component: ph('Home', [
          S('Total students', ''), S('Active batches', ''), S('Mentors', ''), S('Completion', 'Engagement charts'),
        ], 'Platform overview.') },
        { label: 'Programs', path: 'programs', Component: ProgramsManage },
        { label: 'Batches', path: 'batches', Component: AdminBatches },
        { label: 'Mentors', path: 'mentors', Component: AdminMentors },
        { label: 'Forum', path: 'forum', Component: ph('Forum', [
          S('Announcements', 'Global'), S('Moderation', 'Remove content across batches'),
        ]) },
        { label: 'Account', path: 'account', Component: Profile },
      ];
    case 'partner':
      return [
        { label: 'Post a Job', path: '', Component: ph('Post a Job', [
          S('Job form', 'Title, company, description, location, apply flow'),
          S('Publish', 'Appears on the student Job Board'),
        ]) },
        { label: 'Applicants', path: 'applicants', Component: ph('Applicants', [
          S('Per job', 'List of student applicants + status'),
          S('Resume / profile', 'View applicant details'),
        ]) },
        { label: 'Profile', path: 'profile', Component: Profile },
      ];
    default:
      return [{ label: 'Home', path: '', Component: ph('Home', []) }];
  }
}
