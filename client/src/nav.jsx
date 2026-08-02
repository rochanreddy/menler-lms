import Placeholder from './components/Placeholder.jsx';
import Profile from './pages/Profile.jsx';
import Learning from './pages/Learning.jsx';
import ProgramsManage from './pages/ProgramsManage.jsx';
import StudentHome from './pages/StudentHome.jsx';
import StudentGrades from './pages/StudentGrades.jsx';
import AdminBatches from './pages/admin/Batches.jsx';
import AdminMentors from './pages/admin/Mentors.jsx';
import MentorBatches from './pages/mentor/Batches.jsx';
import MentorHome from './pages/mentor/Home.jsx';
import MentorStudents from './pages/mentor/Students.jsx';
import Forum from './pages/Forum.jsx';
import Library from './pages/Library.jsx';
import Webinar from './pages/mentor/Webinar.jsx';
import AdminHome from './pages/admin/Home.jsx';
import JobBoard from './pages/student/JobBoard.jsx';
import AdminStudents from './pages/admin/Students.jsx';
import AdminStudentDetail from './pages/admin/StudentDetail.jsx';
import AdminMentorDetail from './pages/admin/MentorDetail.jsx';
import PostJob from './pages/partner/PostJob.jsx';
import Applicants from './pages/partner/Applicants.jsx';

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
        { label: 'Job Board', path: 'jobs', Component: JobBoard },
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
    case 'partner':
      return [
        { label: 'Post a Job', path: '', Component: PostJob },
        { label: 'Applicants', path: 'applicants', Component: Applicants },
        { label: 'Profile', path: 'profile', Component: Profile },
      ];
    default:
      return [{ label: 'Home', path: '', Component: ph('Home', []) }];
  }
}
