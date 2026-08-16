import { lazy } from 'react';
import Placeholder from './components/Placeholder.jsx';

// Every destination is code-split: a role only downloads the screens it can
// reach, and the heavy ones (lesson player, curriculum editor, PDF reader) load
// on navigation rather than at first paint. AppShell wraps the Outlet in a
// Suspense boundary that shows a fallback while a chunk arrives.
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Learning = lazy(() => import('./pages/Learning.jsx'));
const ProgramsManage = lazy(() => import('./pages/ProgramsManage.jsx'));
const StudentHome = lazy(() => import('./pages/StudentHome.jsx'));
const StudentGrades = lazy(() => import('./pages/StudentGrades.jsx'));
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
    ];
  }
  // Mentors reuse the same student drill-down, rendered read-only (no block
  // or account controls) — the backend only serves them their own students.
  if (role === 'mentor') {
    return [{ path: 'students/:id', Component: AdminStudentDetail }];
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
        { label: 'Forum', path: 'forum', Component: Forum },
        { label: 'Profile', path: 'profile', Component: Profile },
      ];
    case 'mentor':
      return [
        { label: 'Home', path: '', Component: MentorHome },
        { label: 'Learning', path: 'learning', Component: Learning },
        { label: 'Programs', path: 'programs', Component: MentorBatches },
        { label: 'Students', path: 'students', Component: MentorStudents },
        { label: 'Forum', path: 'forum', Component: Forum },
        { label: 'Webinar', path: 'webinar', Component: Webinar },
        { label: 'Profile', path: 'profile', Component: Profile },
      ];
    case 'admin':
      return [
        { label: 'Home', path: '', Component: AdminHome },
        { label: 'Programs', path: 'programs', Component: ProgramsManage },
        { label: 'Batches', path: 'batches', Component: AdminBatches },
        { label: 'Students', path: 'students', Component: AdminStudents },
        { label: 'Mentors', path: 'mentors', Component: AdminMentors },
        { label: 'Library', path: 'library', Component: Library },
        { label: 'Forum', path: 'forum', Component: ph('Forum', [
          S('Announcements', 'Global'), S('Moderation', 'Remove content across batches'),
        ]) },
        { label: 'Account', path: 'account', Component: Profile },
      ];
    // Unknown/retired roles (e.g. legacy partner accounts) get no tabs — App
    // treats an empty nav as "no access" rather than rendering a blank shell.
    default:
      return [];
  }
}
