import { lazy } from 'react';
import Placeholder from './components/Placeholder.jsx';

// Every destination is code-split: a role only downloads the screens it can
// reach, and the heavy ones (lesson player, curriculum editor, PDF reader) load
// on navigation rather than at first paint. AppShell wraps the Outlet in a
// Suspense boundary that shows a fallback while a chunk arrives.
const Profile = lazy(() => import('./pages/Profile.jsx'));
// Named separately from the lazy() wrapper so it can also be called directly
// as a prefetch, on hover/focus of the nav item or ahead of a submission —
// the module registry dedupes, so the later real navigation just resolves
// from cache.
export const loadLearning = () => import('./pages/Learning.jsx');
const Learning = lazy(loadLearning);
const ProgramsManage = lazy(() => import('./pages/ProgramsManage.jsx'));
const StudentHome = lazy(() => import('./pages/StudentHome.jsx'));
// Same trick for Grades: checking your score is what a student does straight
// after submitting, so Learning kicks this off while the Drive check runs.
export const loadStudentGrades = () => import('./pages/StudentGrades.jsx');
const StudentGrades = lazy(loadStudentGrades);
const AdminBatches = lazy(() => import('./pages/admin/Batches.jsx'));
const AdminMentors = lazy(() => import('./pages/admin/Mentors.jsx'));
const MentorBatches = lazy(() => import('./pages/mentor/Batches.jsx'));
const MentorHome = lazy(() => import('./pages/mentor/Home.jsx'));
const MentorStudents = lazy(() => import('./pages/mentor/Students.jsx'));
const Forum = lazy(() => import('./pages/Forum.jsx'));
const Library = lazy(() => import('./pages/Library.jsx'));
const Webinar = lazy(() => import('./pages/mentor/Webinar.jsx'));
const AdminHome = lazy(() => import('./pages/admin/Home.jsx'));
const AdminStudents = lazy(() => import('./pages/admin/Students.jsx'));
const AdminStudentDetail = lazy(() => import('./pages/admin/StudentDetail.jsx'));
const AdminMentorDetail = lazy(() => import('./pages/admin/MentorDetail.jsx'));
// Shared by the admin and the mentor: the admin sees every class's reviews,
// a mentor only their own batches' and never the name against one. The page
// branches on the viewer's role.
const Feedback = lazy(() => import('./pages/admin/Feedback.jsx'));
const AdminDoubts = lazy(() => import('./pages/admin/Doubts.jsx'));
const DoubtSession = lazy(() => import('./pages/DoubtSession.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const AdminSupport = lazy(() => import('./pages/admin/Support.jsx'));
const AdminMail = lazy(() => import('./pages/admin/Mail.jsx'));
const AdminCertificates = lazy(() => import('./pages/admin/Certificates.jsx'));
// Shared by students and admins: the same 300-job shortlist for both, and the
// admin alone can post and remove an opening. Mentors have no tab.
const Jobs = lazy(() => import('./pages/Jobs.jsx'));

// A placeholder page factory — renders the spec's sections for screens whose
// backend is Phase 2.
const ph = (title, sections, blurb) => () => <Placeholder title={title} sections={sections} blurb={blurb} />;

const S = (title, detail) => ({ title, detail });

// Routes that exist for a role but don't get a sidebar tab (detail/drill-down
// pages reached by clicking into a list). Same {path, Component} shape as tabs.
export function extraRoutesFor(role) {
  if (role === 'admin') {
    return [
      { path: 'students/:id', Component: AdminStudentDetail },
      { path: 'mentors/:id', Component: AdminMentorDetail },
      { path: 'account', Component: Profile },
    ];
  }
  // Mentors reuse the same student drill-down, rendered read-only (no block
  // or account controls) — the backend only serves them their own students.
  if (role === 'mentor') {
    return [{ path: 'students/:id', Component: AdminStudentDetail }, { path: 'profile', Component: Profile }];
  }
  if (role === 'student') {
    // Neither of these is a dock tab, for the same reason: both are episodic.
    // A doubt session is empty most weeks, and support is where you go on the
    // day something breaks — a permanent tab for either would crowd the six a
    // student uses constantly and teach them to ignore the dock. The doubt
    // session is reached from its notification and the Home card; support from
    // the account menu, ⌘K, and the notification that a reply has landed.
    return [
      { path: 'profile', Component: Profile },
      { path: 'doubt-session', Component: DoubtSession },
      { path: 'support', Component: Support },
    ];
  }
  return [];
}

// Each role's nav tabs. path '' is the index (Home). label drives the sidebar;
// Component drives the route. Kept in one place so nav + routing never drift.
export function navFor(role) {
  switch (role) {
    case 'student':
      return [
        { label: 'Home', path: '', Component: StudentHome },
        { label: 'Learning', path: 'learning', Component: Learning },
        { label: 'Grades', path: 'grades', Component: StudentGrades },
        { label: 'Library', path: 'library', Component: Library },
        { label: 'Webinar', path: 'webinar', Component: Webinar },
        { label: 'Forum', path: 'forum', Component: Forum },
        // A seventh tab, against the rule that keeps the dock to what students
        // use every week. Jobs earns it the way Doubts and Support do not:
        // those are episodic, while a student nearing the end of a cohort
        // checks a board that changes every morning.
        { label: 'Jobs', path: 'jobs', Component: Jobs },
      ];
    case 'mentor':
      return [
        { label: 'Home', path: '', Component: MentorHome },
        { label: 'Learning', path: 'learning', Component: Learning },
        { label: 'Programs', path: 'programs', Component: MentorBatches },
        { label: 'Students', path: 'students', Component: MentorStudents },
        { label: 'Feedback', path: 'feedback', Component: Feedback },
        { label: 'Forum', path: 'forum', Component: Forum },
        { label: 'Webinar', path: 'webinar', Component: Webinar },
      ];
    case 'admin':
      return [
        { label: 'Home', path: '', Component: AdminHome },
        { label: 'Programs', path: 'programs', Component: ProgramsManage },
        { label: 'Batches', path: 'batches', Component: AdminBatches },
        { label: 'Students', path: 'students', Component: AdminStudents },
        { label: 'Mentors', path: 'mentors', Component: AdminMentors },
        { label: 'Feedback', path: 'feedback', Component: Feedback },
        { label: 'Doubts', path: 'doubts', Component: AdminDoubts },
        { label: 'Support', path: 'support', Component: AdminSupport },
        { label: 'Certificates', path: 'certificates', Component: AdminCertificates },
        { label: 'Mail', path: 'mail', Component: AdminMail },
        { label: 'Jobs', path: 'jobs', Component: Jobs },
        { label: 'Library', path: 'library', Component: Library },
        { label: 'Webinar', path: 'webinar', Component: Webinar },
        { label: 'Forum', path: 'forum', Component: ph('Forum', [
          S('Announcements', 'Global'), S('Moderation', 'Remove content across batches'),
        ]) },
      ];
    // Unknown/retired roles (e.g. legacy partner accounts) get no tabs — App
    // treats an empty nav as "no access" rather than rendering a blank shell.
    default:
      return [];
  }
}
