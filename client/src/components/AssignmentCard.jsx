import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import Markdown from './Markdown.jsx';
import LineIcon from './LineIcon.jsx';
import { CheckBadge, SubmissionCheckPanel } from './SubmissionCheck.jsx';
import { loadStudentGrades } from '../nav.jsx';

// Mirrors the mentor-side DRIVE_TYPES list, in student-facing wording.
const REQUIRED_LABELS = {
  video: 'a video',
  image: 'a photo/screenshot',
  doc: 'a document (PDF, Word or text file)',
  slides: 'a slide deck (PPT)',
  html: 'an HTML file',
};

// Where a piece of work stands, from the student's side. One word per state
// so the list can be filtered and sorted on it (see pages/Learning.jsx).
//   todo      open, nothing handed in yet
//   overdue   deadline passed, nothing handed in
//   fixes     handed in, but the automated check wants changes
//   review    handed in, waiting on the mentor
//   graded    marked
//   upcoming  not open yet
export function assignmentState(a) {
  const sub = a.mySubmission;
  const now = new Date();
  if (a.startDate && new Date(a.startDate) > now) return 'upcoming';
  if (sub?.status === 'graded') return 'graded';
  if (sub && (sub.checkStatus === 'NEEDS_FIXES' || sub.checkStatus === 'CHECK_FAILED')) return 'fixes';
  if (sub) return 'review';
  if (a.dueDate && new Date(a.dueDate) < now) return 'overdue';
  return 'todo';
}

export const STATE_LABEL = { todo: 'To do', overdue: 'Overdue', fixes: 'Needs fixes', review: 'In review', graded: 'Graded', upcoming: 'Opens soon' };

// "in 3 days", "tomorrow", "2 weeks ago" — the part of a date a student
// actually acts on. The absolute date still sits beside it.
export function relative(d) {
  const ms = new Date(d) - new Date();
  const days = Math.round(ms / 86400000);
  const abs = Math.abs(days);
  const ago = ms < 0;
  if (abs === 0) return 'today';
  if (abs === 1) return ago ? 'yesterday' : 'tomorrow';
  const unit = abs >= 14 ? `${Math.round(abs / 7)} weeks` : `${abs} days`;
  return ago ? `${unit} ago` : `in ${unit}`;
}

const fmt = (d) => new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDay = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });

// One assignment or project: a one-line header that says where it stands,
// and under it the brief, the current verification state, the grade and the
// submit form. Work that needs the student opens by default; finished work
// folds to its header so the list stays a list.
export default function AssignmentCard({ a, onChange, onSubmissionChange, defaultOpen }) {
  const { user } = useOutletContext();
  const sub = a.mySubmission;
  const state = assignmentState(a);
  const [open, setOpen] = useState(defaultOpen ?? (state === 'todo' || state === 'overdue' || state === 'fixes'));
  const [driveLink, setDriveLink] = useState(sub?.driveLink || '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    // Checking the score is what happens next, and the server spends a few
    // seconds opening the Drive folder — so pull the Grades chunk during that
    // wait rather than at click time. Fire-and-forget: a failed prefetch just
    // means the normal lazy() load happens on navigation, as before.
    loadStudentGrades().catch(() => {});
    try {
      // Editing re-runs verification server-side, so stale error text can
      // never survive a changed link. Both routes already return the fully
      // checked submission, so there's nothing left to refetch.
      const { submission } = sub
        ? await api(`/submissions/${sub._id}`, { method: 'PATCH', body: { driveLink } })
        : await api('/submissions', { method: 'POST', body: { assignmentId: a._id, driveLink } });
      setEditing(false);
      onSubmissionChange(a._id, submission);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!sub || !window.confirm('Delete this submission? This can’t be undone.')) return;
    setBusy(true);
    setError('');
    try { await api(`/submissions/${sub._id}`, { method: 'DELETE' }); onChange(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const overdue = a.dueDate && new Date(a.dueDate) < new Date();
  const notOpenYet = state === 'upcoming';
  const due = a.dueDate && fmt(a.dueDate);
  const start = a.startDate && fmt(a.startDate);
  const showForm = (!sub || editing) && !notOpenYet;
  // Mirrors the server's rules — the API is still the authority, this just
  // avoids offering an action that would be rejected.
  const editable = !sub?.locked && !overdue && !notOpenYet;
  const required = (a.requiredDriveTypes || []).map((t) => REQUIRED_LABELS[t] || t);

  // The one line of timing that matters for this state.
  let when = null;
  if (notOpenYet) when = <>Opens {fmtDay(a.startDate)} · {relative(a.startDate)}</>;
  else if (a.dueDate && (state === 'todo' || state === 'fixes')) when = <>Due {fmtDay(a.dueDate)} · <b>{relative(a.dueDate)}</b></>;
  else if (a.dueDate && state === 'overdue') when = <>Was due {fmtDay(a.dueDate)} · {relative(a.dueDate)}</>;
  else if (sub?.submittedAt || sub?.createdAt) when = <>Submitted {fmtDay(sub.submittedAt || sub.createdAt)}</>;
  else if (a.dueDate) when = <>Due {fmtDay(a.dueDate)}</>;

  return (
    <div className={`panel assign-card ac ac-${state} ${open ? 'is-open' : ''}`}>
      <button type="button" className="ac-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="ac-kind" aria-hidden="true"><LineIcon name={a.type === 'project' ? 'rocket' : 'upload'} size={17} /></span>
        <span className="ac-copy">
          <span className="ac-title">{a.title}</span>
          <span className="ac-meta">
            <span className="ac-type">{a.type}</span>
            {when && <span className={`ac-when ${state === 'overdue' ? 'is-overdue' : ''}`}>{when}</span>}
          </span>
        </span>
        <span className={`ac-status st-${state}`}>
          {state === 'graded' && sub?.score != null ? <><b>{sub.score}</b>/10</> : STATE_LABEL[state]}
        </span>
        <span className="ac-caret">⌄</span>
      </button>

      {open && (
        <div className="ac-body">
          {a.description && <div className="assign-desc"><Markdown text={a.description} /></div>}

          {/* Current verification state — visible without opening notifications. */}
          {sub && !editing && (
            <SubmissionCheckPanel submission={{ ...sub, driveLink: sub.driveLink || sub.url }} audience="student" />
          )}

          {/* The grade is the answer to "how did I do" — it gets its own surface
              instead of floating as a big number beside a label. Mentor feedback is
              a human moment, so it takes the serif the way certificates do. */}
          {sub?.status === 'graded' && (
            <div className="graded">
              <div className="graded-score">
                <span className="graded-score-num">{sub.score != null ? sub.score : '-'}</span>
                {sub.score != null && <span className="graded-score-of">/10</span>}
              </div>
              <div className="graded-body">
                <div className="graded-label">Score</div>
                {sub.feedback
                  ? <p className="graded-feedback">“{sub.feedback}”</p>
                  : <p className="graded-none">No written feedback left.</p>}
              </div>
            </div>
          )}

          {error && <p className="sub-check-error">{error}</p>}

          {notOpenYet ? (
            <p className="assign-note">Submissions for this {a.type} open on {start}.</p>
          ) : showForm ? (
            <form className="sub-form" onSubmit={submit}>
              {/* On an edit after a failed check, lead with what needs fixing. */}
              {editing && (sub?.checkStatus === 'NEEDS_FIXES' || sub?.checkStatus === 'CHECK_FAILED') && sub?.errorDetail && (
                <div className="sub-form-alert">
                  <CheckBadge status={sub.checkStatus} audience="student" />
                  <p>{sub.errorDetail}</p>
                </div>
              )}

              <div className="sub-form-grid">
                <div className="sub-field">
                  <span className="sub-field-label">Student</span>
                  <span className="sub-field-value">{user?.full_name || user?.fullName || user?.email}</span>
                </div>
                <div className="sub-field">
                  <span className="sub-field-label">{a.type === 'project' ? 'Project' : 'Assignment'}</span>
                  <span className="sub-field-value">{a.title}</span>
                </div>
                <div className="sub-field">
                  <span className="sub-field-label">Opens</span>
                  <span className="sub-field-value">{start || 'Open now'}</span>
                </div>
                <div className="sub-field">
                  <span className="sub-field-label">Last date to submit</span>
                  <span className={`sub-field-value ${overdue ? 'is-overdue' : ''}`}>{due || 'No deadline'}</span>
                </div>
              </div>

              {/* Both preconditions come BEFORE the field, not after the button.
                  They were below it, which is where a student reads them only
                  after the automated check has already rejected the folder. */}
              <div className="sub-reqs">
                <p className="sub-reqs-lead">Before you paste the link</p>
                <ul className="sub-reqs-list">
                  <li>
                    <span className="sub-req-tick" aria-hidden="true" />
                    Share the folder as <strong>“Anyone with the link can view”</strong>, a private
                    folder fails the check even when everything is in it.
                  </li>
                  {required.length > 0 && (
                    <li>
                      <span className="sub-req-tick" aria-hidden="true" />
                      It must contain {required.join(', ')}.
                    </li>
                  )}
                </ul>
              </div>

              <label className="sub-field-label" htmlFor={`drive-${a._id}`}>Google Drive folder link</label>
              <div className="assign-submit">
                <input
                  id={`drive-${a._id}`}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={driveLink}
                  onChange={(e) => setDriveLink(e.target.value)}
                  required
                />
              </div>
              {/* Full-size primary: this is the single most important thing a
                  student does in the product. Cancel drops to .quiet so the two
                  stop reading as equal choices. */}
              <div className="sub-actions">
                <button className={`btn ${busy ? 'is-busy' : ''}`} disabled={busy}>
                  {busy ? 'Checking your folder…' : (sub ? 'Save changes' : 'Submit for review')}
                </button>
                {sub && (
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => { setEditing(false); setError(''); setDriveLink(sub.driveLink || ''); }}
                  >
                    Cancel
                  </button>
                )}
                {busy && <span className="sub-actions-note">We open the folder and check its contents. This takes a few seconds.</span>}
              </div>
            </form>
          ) : sub?.locked ? (
            <p className="assign-note">This submission has been reviewed and is locked. Ask your mentor to unlock it if you need to change it.</p>
          ) : overdue ? (
            <p className="assign-note">The deadline has passed, so this submission can no longer be changed.</p>
          ) : (
            <div className="inline-form">
              <button type="button" className="btn sm ghost" onClick={() => setEditing(true)} disabled={!editable}>Edit submission</button>
              <button type="button" className={`btn sm ghost-danger ${busy ? 'is-busy' : ''}`} onClick={remove} disabled={busy || !editable}>Delete</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
