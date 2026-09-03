import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../api.js';
import LineIcon from './LineIcon.jsx';
import Markdown from './Markdown.jsx';
import Empty from './Empty.jsx';
import { AnnouncementForm, SessionForm, QuizBuilder, AssignmentForm, DRIVE_TYPES } from './BatchForms.jsx';
import { QuizResults, Attendance, Submissions } from './BatchGrading.jsx';

// Re-exported from its new home in BatchForms.jsx so this module's public
// shape is unchanged for anything that imported it from here.
export { DRIVE_TYPES };

const dueLabel = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Shared batch detail used by admin + mentor.
// - admin mode: assign mentor, enroll student, schedule sessions.
// - mentor mode: schedule sessions, mark attendance, set assignments, grade.
export default function BatchWorkspace({ batchId, mode }) {
  const [batch, setBatch] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [gradebook, setGradebook] = useState(null);
  const [msg, setMsg] = useState('');
  const [newStudent, setNewStudent] = useState(null); // { email, password } if an account was auto-created
  const [allMentors, setAllMentors] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [pickMentor, setPickMentor] = useState('');
  const [pickStudent, setPickStudent] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const loadBatch = () => api(`/batches/${batchId}`).then((d) => setBatch(d.batch)).catch(() => {});
  const loadSessions = () => api(`/sessions?batchId=${batchId}`).then((d) => setSessions(d.sessions || [])).catch(() => {});
  const loadAssignments = () => api(`/assignments?batchId=${batchId}`).then((d) => setAssignments(d.assignments || [])).catch(() => {});
  const loadQuizzes = () => api(`/quizzes?batchId=${batchId}`).then((d) => setQuizzes(d.quizzes || [])).catch(() => {});
  const loadPeople = () => {
    api('/users?role=mentor').then((d) => setAllMentors(d.users || [])).catch(() => {});
    api('/users?role=student').then((d) => setAllStudents(d.users || [])).catch(() => {});
  };
  const loadAnnouncements = () => api(`/announcements?batchId=${batchId}`).then((d) => setAnnouncements(d.announcements || [])).catch(() => {});
  const loadGradebook = () => api(`/grades/batch/${batchId}`).then(setGradebook).catch(() => setGradebook(null));
  useEffect(() => { loadBatch(); loadSessions(); loadAssignments(); loadQuizzes(); loadAnnouncements(); loadGradebook(); }, [batchId]);
  useEffect(() => { if (mode === 'admin') loadPeople(); }, [mode]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  async function act(fn, okMsg) { try { await fn(); flash(okMsg); } catch (e) { flash(e.message); } }

  async function assignMentor() {
    const m = allMentors.find((x) => x.id === pickMentor);
    if (!m) return;
    await act(() => api(`/batches/${batchId}/mentors`, { method: 'POST', body: { email: m.email } }).then(() => { setPickMentor(''); loadBatch(); }), 'Mentor assigned');
  }
  async function enrolExisting() {
    const s = allStudents.find((x) => x.id === pickStudent);
    if (!s) return;
    await act(() => api(`/batches/${batchId}/students`, { method: 'POST', body: { email: s.email } }).then(() => { setPickStudent(''); loadBatch(); }), 'Student enrolled');
  }
  async function enrolNew(e) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setNewStudent(null);
    try {
      const res = await api(`/batches/${batchId}/students`, { method: 'POST', body: { email: newEmail } });
      setNewEmail('');
      loadBatch();
      if (res.created) { setNewStudent({ email: res.user.email, password: res.tempPassword }); loadPeople(); }
      else flash('Student enrolled');
    } catch (e2) { flash(e2.message); }
  }
  async function removeMember(userId) {
    await act(() => api(`/batches/${batchId}/members/${userId}`, { method: 'DELETE' }).then(loadBatch), 'Removed');
  }

  // Admin course-block: hide THIS batch from one member (they keep the rest of
  // their LMS). Toggles the batch id in the user's blocked.batchIds set.
  const courseBlocked = (u) => ((u.blocked?.batchIds) || []).map(String).includes(String(batchId));
  async function toggleCourseBlock(u) {
    const ids = new Set(((u.blocked?.batchIds) || []).map(String));
    const wasBlocked = ids.has(String(batchId));
    if (wasBlocked) ids.delete(String(batchId)); else ids.add(String(batchId));
    await act(
      () => api(`/users/${u._id}/blocks`, { method: 'PATCH', body: { batchIds: [...ids] } }).then(loadBatch),
      wasBlocked ? 'Course unblocked for member' : 'Course blocked for member',
    );
  }

  if (!batch) return <div className="skeleton-stack"><div className="skeleton-row" /><div className="skeleton-row tall" /><div className="skeleton-row tall" /></div>;

  // Admin gets every mentor power (the backend already allows it) plus
  // admin-only member management and moderation.
  const canManage = mode === 'mentor' || mode === 'admin';

  const availableMentors = allMentors.filter((m) => !batch.mentorIds.some((bm) => bm._id === m.id));
  const availableStudents = allStudents.filter((s) => !batch.studentIds.some((bs) => bs._id === s.id));

  return (
    <div className="stack batch-ws">
      <div className="ws-head">
        <div>
          <h2 style={{ margin: 0 }}>{batch.name}</h2>
          <div className="ws-tags">
            {batch.programId?.title && <span className="badge badge-mentor">{batch.programId.title}</span>}
            <span className="badge badge-muted">{batch.status}</span>
          </div>
        </div>
        <div className="row">
          {msg && <span className="ws-flash">{msg}</span>}
          {mode === 'admin' && (
            <button className="btn sm ghost" onClick={() => downloadFile(`/reports/batch/${batchId}`)}>Batch report (CSV)</button>
          )}
        </div>
      </div>

      {/* Roster */}
      <section className="panel">
        <h3 className="ws-h3">Roster</h3>
        <div className="roster">
          <div className="roster-col">
            <div className="roster-col-head">Mentors <span className="roster-n">{batch.mentorIds.length}</span></div>
            {mode === 'admin' ? (
              <div className="member-list">
                {batch.mentorIds.map((m) => (
                  <MemberRow
                    key={m._id}
                    user={m}
                    kind="mentor"
                    href={`/app/mentors/${m._id}`}
                    blocked={courseBlocked(m)}
                    onToggleBlock={() => toggleCourseBlock(m)}
                    onRemove={() => removeMember(m._id)}
                  />
                ))}
                {batch.mentorIds.length === 0 && <p className="muted roster-empty">No mentors assigned.</p>}
              </div>
            ) : (
              <div className="chips">
                {batch.mentorIds.map((m) => (
                  <span key={m._id} className="chip"><span className="chip-av chip-av-m">{(m.fullName || m.email)[0].toUpperCase()}</span>{m.fullName || m.email}</span>
                ))}
                {batch.mentorIds.length === 0 && <p className="muted roster-empty">No mentors assigned.</p>}
              </div>
            )}
          </div>
          <div className="roster-col">
            <div className="roster-col-head">Students <span className="roster-n">{batch.studentIds.length}</span></div>
            {mode === 'admin' ? (
              <div className="member-list">
                {batch.studentIds.map((s) => (
                  <MemberRow
                    key={s._id}
                    user={s}
                    kind="student"
                    href={`/app/students/${s._id}`}
                    blocked={courseBlocked(s)}
                    onToggleBlock={() => toggleCourseBlock(s)}
                    onRemove={() => removeMember(s._id)}
                  />
                ))}
                {batch.studentIds.length === 0 && <p className="muted roster-empty">No students enrolled yet.</p>}
              </div>
            ) : (
              <div className="chips">
                {batch.studentIds.map((s) => (
                  <span key={s._id} className="chip"><span className="chip-av">{(s.fullName || s.email)[0].toUpperCase()}</span>{s.fullName || s.email}</span>
                ))}
                {batch.studentIds.length === 0 && <p className="muted roster-empty">No students enrolled yet.</p>}
              </div>
            )}
          </div>
        </div>

        {mode === 'admin' && (
          <>
            <div className="roster-controls">
              <div className="rc-card">
                <label>Assign a mentor</label>
                <select className="rc-select" value={pickMentor} onChange={(e) => setPickMentor(e.target.value)}>
                  <option value="">Choose a mentor…</option>
                  {availableMentors.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                </select>
                <button className="btn sm rc-btn" onClick={assignMentor} disabled={!pickMentor}>Assign mentor</button>
              </div>

              <div className="rc-card">
                <label>Enrol an existing student</label>
                <select className="rc-select" value={pickStudent} onChange={(e) => setPickStudent(e.target.value)}>
                  <option value="">Choose a student…</option>
                  {availableStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
                </select>
                <button className="btn sm rc-btn" onClick={enrolExisting} disabled={!pickStudent}>Enrol student</button>
              </div>

              <div className="rc-card">
                <label>New paid student</label>
                <form className="rc-form" onSubmit={enrolNew}>
                  <input className="rc-input" type="email" placeholder="Email they enrolled with" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                  <button className="btn sm ghost rc-btn">Create &amp; enrol</button>
                </form>
              </div>
            </div>

            {newStudent && (
              <div className="tempbox">
                <div className="tempbox-line"><span className="tempbox-ic"><LineIcon name="check" size={16} /></span><span>New student account created for <strong>{newStudent.email}</strong>, temp password: <code>{newStudent.password}</code></span></div>
                <div className="muted">Share these; they'll set their own password on first login.</div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Announcements */}
      <section className="panel">
        <h3 className="h3-ic"><LineIcon name="megaphone" size={17} /> Announcements</h3>
        {canManage && (
          <AnnouncementForm onPost={(body) => act(() => api('/announcements', { method: 'POST', body: { batchId, ...body } }).then(loadAnnouncements), 'Announcement posted, students notified')} />
        )}
        {announcements.map((a) => (
          <div key={a._id} className="assignment">
            <div className="row"><strong>{a.title}</strong><span className="muted">{new Date(a.createdAt).toLocaleDateString()}</span></div>
            {a.body && <p className="muted" style={{ marginTop: 4 }}>{a.body}</p>}
          </div>
        ))}
        {announcements.length === 0 && <Empty inline icon="forum" title="No announcements yet." hint="Anything you post here reaches every student in the batch." />}
      </section>

      {/* Sessions, with Zoom link */}
      <section className="panel">
        <h3>Sessions & Zoom links</h3>
        {mode === 'admin' && (
          <SessionForm onAdd={(body) => act(() => api('/sessions', { method: 'POST', body: { batchId, ...body } }).then(loadSessions), 'Session scheduled')} />
        )}
        <div className="session-list">
          {sessions.map((s) => {
            const d = new Date(s.startsAt);
            return (
              <div key={s._id} className="session-row">
                <div className="session-date">
                  <span className="session-date-d">{d.getDate()}</span>
                  <span className="session-date-m">{d.toLocaleString([], { month: 'short' })}</span>
                </div>
                <div className="session-info">
                  <strong>{s.title}</strong>
                  <div className="session-sub">
                    <span className="muted">{d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    {s.joinUrl
                      ? <a href={s.joinUrl} target="_blank" rel="noreferrer" className="zoom-link"><LineIcon name="video" size={14} /> Join Zoom</a>
                      : <span className="muted">No link yet</span>}
                  </div>
                </div>
                <Attendance session={s} students={batch.studentIds} onDone={() => flash('Attendance saved')} />
              </div>
            );
          })}
          {sessions.length === 0 && (
            <Empty
              inline
              icon="webinar"
              title="No sessions yet."
              hint={mode === 'admin' ? 'Schedule one above. Students and mentors see it and join from there.' : 'The admin schedules Zoom classes for this batch. They will appear here to join.'}
            />
          )}
        </div>
      </section>

      {/* Assignments + grading (mentor) */}
      <section className="panel">
        <h3>Assignments & Projects</h3>
        {canManage && (
          <AssignmentForm onAdd={(body) => act(() => api('/assignments', { method: 'POST', body: { batchId, ...body } }).then(loadAssignments), 'Assignment created')} />
        )}
        {assignments.map((a) => (
          <div key={a._id} className="assignment">
            <div className="assignment-head">
              <strong>{a.title}</strong>
              <span className={`badge ${a.type === 'project' ? 'badge-mentor' : ''}`}>{a.type}</span>
              {a.startDate && <span className="assignment-due"><LineIcon name="clock" size={13} /> Opens {dueLabel(a.startDate)}</span>}
              {a.dueDate && <span className="assignment-due"><LineIcon name="clock" size={13} /> Due {dueLabel(a.dueDate)}</span>}
            </div>
            {(a.requiredDriveTypes || []).length > 0 && (
              <div className="assignment-reqs">
                <span className="muted">Requires in Drive folder:</span>
                {a.requiredDriveTypes.map((t) => (
                  <span key={t} className="badge badge-muted">{DRIVE_TYPES.find((d) => d.key === t)?.label || t}</span>
                ))}
              </div>
            )}
            {a.description && <div className="assignment-desc"><Markdown text={a.description} /></div>}
            {canManage && <Submissions assignmentId={a._id} />}
          </div>
        ))}
        {assignments.length === 0 && <Empty inline icon="grades" title="No assignments yet." hint="Set one above. Students submit a Drive folder, which is checked automatically." />}
      </section>

      {/* Quizzes & exams (mentor authors + tracks results) */}
      <section className="panel">
        <h3>Quizzes & Exams</h3>
        {canManage && (
          <QuizBuilder onCreate={(body) => act(() => api('/quizzes', { method: 'POST', body: { batchId, ...body } }).then(loadQuizzes), 'Quiz posted')} />
        )}
        {quizzes.map((q) => (
          <div key={q._id} className="assignment">
            <div className="row"><strong>{q.title}</strong><span className="badge">{q.type}</span><span className="muted">{q.questions?.length || 0} questions</span></div>
            {canManage && <QuizResults quizId={q._id} />}
          </div>
        ))}
        {quizzes.length === 0 && <Empty inline icon="learning" title="No quizzes yet." hint="Build one above to test the batch on what you have covered." />}
      </section>

      {/* Gradebook, students × assessments matrix */}
      <section className="panel">
        <h3>Gradebook</h3>
        {!gradebook || gradebook.rows.length === 0 ? (
          <Empty inline icon="students" title="No students to grade yet." hint="Enrol students in the roster above and the gradebook fills in." />
        ) : gradebook.columns.length === 0 ? (
          <Empty inline icon="grades" title="Nothing to grade yet." hint="Add an assignment or a quiz above and every student gets a column here." />
        ) : (
          <div className="table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {gradebook.columns.map((c) => <th scope="col" key={c.id} title={c.title}>{c.title.length > 14 ? c.title.slice(0, 13) + '…' : c.title}</th>)}
                  <th scope="col">Avg</th>
                </tr>
              </thead>
              <tbody>
                {gradebook.rows.map((r) => (
                  <tr key={r.studentId}>
                    <th scope="row" className="gb-rowhead">{r.name}</th>
                    {r.cells.map((cv, i) => (
                      <td key={gradebook.columns[i].id} className={`gb-cell gb-${cv.status}`}>
                        {cv.score == null
                          ? (cv.status === 'submitted' ? '•' : '-')
                          : (gradebook.columns[i].max ? `${cv.score}/${gradebook.columns[i].max}` : cv.score)}
                      </td>
                    ))}
                    <td><strong>{r.avgPct != null ? `${r.avgPct}%` : '-'}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// Admin roster row: clickable identity + clearly-labeled actions, instead of
// cryptic chip glyphs. Blocked members are visually muted with an explicit badge.
function MemberRow({ user, kind, href, blocked, onToggleBlock, onRemove }) {
  const name = user.fullName || user.email;
  return (
    <div className={`member-row ${blocked ? 'is-blocked' : ''}`}>
      <span className={`member-av ${kind === 'mentor' ? 'member-av-m' : ''}`}>{name[0].toUpperCase()}</span>
      <div className="member-id">
        <Link className="member-name" to={href} title={`Open ${kind} profile`}>{name}</Link>
        <div className="member-tags">
          {user.blocked?.lms && <span className="badge badge-blocked">LMS blocked</span>}
          {blocked && <span className="badge badge-blocked">course blocked</span>}
        </div>
      </div>
      <div className="member-actions">
        <button type="button" className={`btn sm ${blocked ? 'ghost' : 'ghost-danger'}`} onClick={onToggleBlock}>
          {blocked ? 'Unblock course' : 'Block course'}
        </button>
        <button type="button" className="btn sm quiet" title="Remove from batch" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}
