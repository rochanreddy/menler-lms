import { useEffect, useState } from 'react';
import { api } from '../api.js';
import LineIcon from './LineIcon.jsx';
import Markdown from './Markdown.jsx';

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

  if (!batch) return <p className="muted">Loading batch…</p>;

  const availableMentors = allMentors.filter((m) => !batch.mentorIds.some((bm) => bm._id === m.id));
  const availableStudents = allStudents.filter((s) => !batch.studentIds.some((bs) => bs._id === s.id));

  return (
    <div className="stack batch-ws">
      <div className="ws-head">
        <div>
          <h2 style={{ margin: 0 }}>{batch.name}</h2>
          <div className="ws-tags">
            {batch.programId?.title && <span className="badge badge-mentor">{batch.programId.title}</span>}
            <span className="badge">{batch.status}</span>
          </div>
        </div>
        {msg && <span className="ws-flash">{msg}</span>}
      </div>

      {/* Roster */}
      <section className="panel">
        <h3 className="ws-h3">Roster</h3>
        <div className="roster">
          <div className="roster-col">
            <div className="roster-col-head">Mentors <span className="roster-n">{batch.mentorIds.length}</span></div>
            <div className="chips">
              {batch.mentorIds.map((m) => (
                <span key={m._id} className="chip"><span className="chip-av chip-av-m">{(m.fullName || m.email)[0].toUpperCase()}</span>{m.fullName || m.email}{mode === 'admin' && <button type="button" className="chip-x" title="Remove" onClick={() => removeMember(m._id)}>×</button>}</span>
              ))}
              {batch.mentorIds.length === 0 && <p className="muted roster-empty">No mentors assigned.</p>}
            </div>
          </div>
          <div className="roster-col">
            <div className="roster-col-head">Students <span className="roster-n">{batch.studentIds.length}</span></div>
            <div className="chips">
              {batch.studentIds.map((s) => (
                <span key={s._id} className="chip"><span className="chip-av">{(s.fullName || s.email)[0].toUpperCase()}</span>{s.fullName || s.email}{mode === 'admin' && <button type="button" className="chip-x" title="Remove" onClick={() => removeMember(s._id)}>×</button>}</span>
              ))}
              {batch.studentIds.length === 0 && <p className="muted roster-empty">No students enrolled yet.</p>}
            </div>
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
                <div className="tempbox-line"><span className="tempbox-ic"><LineIcon name="check" size={16} /></span><span>New student account created for <strong>{newStudent.email}</strong> — temp password: <code>{newStudent.password}</code></span></div>
                <div className="muted">Share these; they'll set their own password on first login.</div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Announcements */}
      <section className="panel">
        <h3 className="h3-ic"><LineIcon name="megaphone" size={17} /> Announcements</h3>
        {mode === 'mentor' && (
          <AnnouncementForm onPost={(body) => act(() => api('/announcements', { method: 'POST', body: { batchId, ...body } }).then(loadAnnouncements), 'Announcement posted — students notified')} />
        )}
        {announcements.map((a) => (
          <div key={a._id} className="assignment">
            <div className="row"><strong>{a.title}</strong><span className="muted">{new Date(a.createdAt).toLocaleDateString()}</span></div>
            {a.body && <p className="muted" style={{ marginTop: 4 }}>{a.body}</p>}
          </div>
        ))}
        {announcements.length === 0 && <p className="muted">No announcements yet.</p>}
      </section>

      {/* Sessions — with Zoom link */}
      <section className="panel">
        <h3>Sessions & Zoom links</h3>
        <SessionForm onAdd={(body) => act(() => api('/sessions', { method: 'POST', body: { batchId, ...body } }).then(loadSessions), 'Session scheduled')} />
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
          {sessions.length === 0 && <p className="muted">No sessions yet.</p>}
        </div>
      </section>

      {/* Assignments + grading (mentor) */}
      <section className="panel">
        <h3>Assignments & Projects</h3>
        {mode === 'mentor' && (
          <AssignmentForm onAdd={(body) => act(() => api('/assignments', { method: 'POST', body: { batchId, ...body } }).then(loadAssignments), 'Assignment created')} />
        )}
        {assignments.map((a) => (
          <div key={a._id} className="assignment">
            <div className="assignment-head">
              <strong>{a.title}</strong>
              <span className={`badge ${a.type === 'project' ? 'badge-mentor' : ''}`}>{a.type}</span>
              {a.dueDate && <span className="assignment-due"><LineIcon name="clock" size={13} /> Due {dueLabel(a.dueDate)}</span>}
            </div>
            {a.description && <div className="assignment-desc"><Markdown text={a.description} /></div>}
            {mode === 'mentor' && <Submissions assignmentId={a._id} />}
          </div>
        ))}
        {assignments.length === 0 && <p className="muted">No assignments yet.</p>}
      </section>

      {/* Quizzes & exams (mentor authors + tracks results) */}
      <section className="panel">
        <h3>Quizzes & Exams</h3>
        {mode === 'mentor' && (
          <QuizBuilder onCreate={(body) => act(() => api('/quizzes', { method: 'POST', body: { batchId, ...body } }).then(loadQuizzes), 'Quiz posted')} />
        )}
        {quizzes.map((q) => (
          <div key={q._id} className="assignment">
            <div className="row"><strong>{q.title}</strong><span className="badge">{q.type}</span><span className="muted">{q.questions?.length || 0} questions</span></div>
            {mode === 'mentor' && <QuizResults quizId={q._id} />}
          </div>
        ))}
        {quizzes.length === 0 && <p className="muted">No quizzes yet.</p>}
      </section>

      {/* Gradebook — students × assessments matrix */}
      <section className="panel">
        <h3>Gradebook</h3>
        {!gradebook || gradebook.rows.length === 0 ? (
          <p className="muted">No students to grade yet.</p>
        ) : gradebook.columns.length === 0 ? (
          <p className="muted">No assignments or quizzes yet — add some above and grades will appear here.</p>
        ) : (
          <div className="table-wrap">
            <table className="grade-table">
              <thead>
                <tr>
                  <th>Student</th>
                  {gradebook.columns.map((c) => <th key={c.id} title={c.title}>{c.title.length > 14 ? c.title.slice(0, 13) + '…' : c.title}</th>)}
                  <th>Avg</th>
                </tr>
              </thead>
              <tbody>
                {gradebook.rows.map((r) => (
                  <tr key={r.studentId}>
                    <td>{r.name}</td>
                    {r.cells.map((cv, i) => (
                      <td key={gradebook.columns[i].id} className={`gb-cell gb-${cv.status}`}>
                        {cv.score == null
                          ? (cv.status === 'submitted' ? '•' : '—')
                          : (gradebook.columns[i].max ? `${cv.score}/${gradebook.columns[i].max}` : cv.score)}
                      </td>
                    ))}
                    <td><strong>{r.avgPct != null ? `${r.avgPct}%` : '—'}</strong></td>
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

function AnnouncementForm({ onPost }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onPost({ title, body }); setTitle(''); setBody(''); } }} style={{ marginBottom: 8 }}>
      <div className="inline-form">
        <input placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
        <button className="btn sm">Post &amp; notify</button>
      </div>
      <input placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', marginTop: 8 }} className="ann-body" />
    </form>
  );
}

function SessionForm({ onAdd }) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [zoomMeetingId, setZoomMeetingId] = useState('');
  return (
    <>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (title && startsAt) { onAdd({ title, startsAt: new Date(startsAt).toISOString(), joinUrl, zoomMeetingId }); setTitle(''); setStartsAt(''); setJoinUrl(''); setZoomMeetingId(''); } }}>
        <input placeholder="Session title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <input placeholder="Zoom link (https://…)" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} />
        <input placeholder="Zoom meeting ID (optional)" value={zoomMeetingId} onChange={(e) => setZoomMeetingId(e.target.value)} />
        <button className="btn sm">Add session</button>
      </form>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Meeting ID auto-fills from a zoom.us/j/… link. For a registration link, paste the numeric Meeting ID so Zoom-join attendance can be matched.</p>
    </>
  );
}

// Mentor quiz author: title/type + a growing list of questions, each with
// options and a "correct" radio.
function QuizBuilder({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('quiz');
  const blank = () => ({ text: '', options: ['', ''], correctIndex: 0, explanation: '' });
  const [questions, setQuestions] = useState([blank()]);

  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const setOpt = (qi, oi, val) => setQ(qi, { options: questions[qi].options.map((o, idx) => (idx === oi ? val : o)) });
  const addOption = (qi) => setQ(qi, { options: [...questions[qi].options, ''] });
  const addQuestion = () => setQuestions((qs) => [...qs, blank()]);

  function submit(e) {
    e.preventDefault();
    const clean = questions
      .map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) }))
      .filter((q) => q.text.trim() && q.options.length >= 2);
    if (!title.trim() || clean.length === 0) return;
    onCreate({ title, type, questions: clean });
    setTitle(''); setType('quiz'); setQuestions([blank()]); setOpen(false);
  }

  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>+ New quiz / exam</button>;
  return (
    <form className="quiz-builder" onSubmit={submit}>
      <div className="inline-form">
        <input placeholder="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="quiz">Quiz</option><option value="exam">Exam</option></select>
      </div>
      {questions.map((q, qi) => (
        <div key={qi} className="quiz-q">
          <input placeholder={`Question ${qi + 1}`} value={q.text} onChange={(e) => setQ(qi, { text: e.target.value })} />
          {q.options.map((o, oi) => (
            <label key={oi} className="quiz-opt">
              <input type="radio" name={`correct-${qi}`} checked={q.correctIndex === oi} onChange={() => setQ(qi, { correctIndex: oi })} />
              <input placeholder={`Option ${oi + 1}`} value={o} onChange={(e) => setOpt(qi, oi, e.target.value)} />
            </label>
          ))}
          <button type="button" className="btn sm ghost" onClick={() => addOption(qi)}>+ option</button>
          <textarea
            className="quiz-why-input"
            rows={2}
            placeholder="Explanation (optional) — shown to students after they answer"
            value={q.explanation}
            onChange={(e) => setQ(qi, { explanation: e.target.value })}
          />
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn sm ghost" onClick={addQuestion}>+ question</button>
        <button className="btn sm" type="submit">Post quiz</button>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Tick the radio next to the correct option. Explanations appear in the student's answer review.</p>
    </form>
  );
}

function QuizResults({ quizId }) {
  const [data, setData] = useState(null);
  const load = () => api(`/quizzes/${quizId}/results`).then(setData).catch(() => setData({ attempts: [] }));
  if (!data) return <button className="btn sm ghost" onClick={load}>View results</button>;
  const { attempts, quiz } = data;
  return (
    <div className="subs">
      {attempts.length === 0 ? <p className="muted">No attempts yet.</p> : attempts.map((a) => (
        <div key={a._id} className="grade-row">
          <strong>{a.studentId?.fullName || a.studentId?.email}</strong>
          <span className="badge badge-student">{a.score}/{a.total ?? quiz?.total}</span>
        </div>
      ))}
    </div>
  );
}

function AssignmentForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('assignment');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  function reset() { setTitle(''); setType('assignment'); setDescription(''); setDueDate(''); setOpen(false); }
  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), type, description: description.trim(), dueDate: dueDate ? new Date(dueDate).toISOString() : null });
    reset();
  }

  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>+ New assignment</button>;

  return (
    <form className="af" onSubmit={submit}>
      <div className="af-top">
        <input className="af-title" placeholder={type === 'project' ? 'Project title' : 'Assignment title'} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="af-seg">
          <button type="button" className={type === 'assignment' ? 'on' : ''} onClick={() => setType('assignment')}>Assignment</button>
          <button type="button" className={type === 'project' ? 'on' : ''} onClick={() => setType('project')}>Project</button>
        </div>
      </div>

      <label className="af-label">Description &amp; instructions</label>
      <textarea
        className="af-desc"
        rows={6}
        placeholder={"Explain the task clearly:\n• What students need to do\n• Deliverables to submit (link, repo, doc…)\n• How it will be graded\n\nMarkdown supported — **bold**, - lists, `code`."}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="af-foot">
        <label className="af-due">
          <span>Due date <span className="muted">(optional)</span></span>
          <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <div className="af-actions">
          <button type="button" className="btn ghost sm" onClick={reset}>Cancel</button>
          <button className="btn sm" disabled={!title.trim()}>Post {type}</button>
        </div>
      </div>
    </form>
  );
}

function Attendance({ session, students, onDone }) {
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lock the page behind the modal so scrolling stays inside it.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  async function openModal() {
    setOpen(true); setLoading(true);
    try {
      const { records } = await api(`/attendance/session/${session._id}`);
      const m = {};
      (records || []).forEach((r) => { m[r.studentId] = r.status === 'present'; });
      setMarks(m);
    } catch { setMarks({}); }
    finally { setLoading(false); }
  }
  const present = students.filter((s) => marks[s._id]).length;
  const set = (id, val) => setMarks((m) => ({ ...m, [id]: val }));
  const allPresent = () => setMarks(Object.fromEntries(students.map((s) => [s._id, true])));
  const clearAll = () => setMarks({});

  async function save() {
    setSaving(true);
    try {
      const records = students.map((s) => ({ studentId: s._id, status: marks[s._id] ? 'present' : 'absent' }));
      await api(`/attendance/session/${session._id}`, { method: 'POST', body: { records } });
      setOpen(false); onDone();
    } finally { setSaving(false); }
  }

  return (
    <>
      <button className="btn sm ghost" onClick={openModal}>Mark attendance</button>
      {open && (
        <div className="att-overlay" onClick={() => !saving && setOpen(false)}>
          <div className="att-modal" onClick={(e) => e.stopPropagation()}>
            <div className="att-head">
              <div>
                <div className="att-kicker">Attendance</div>
                <div className="att-title">{session.title}</div>
                <div className="muted att-when">{new Date(session.startsAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <button className="att-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="att-toolbar">
              <div className="att-count"><strong>{present}</strong> <span className="muted">/ {students.length} present</span></div>
              <div className="att-quick">
                <button className="att-link" onClick={allPresent}>Mark all present</button>
                <span className="att-dot">·</span>
                <button className="att-link" onClick={clearAll}>Clear</button>
              </div>
            </div>

            <div className="att-list">
              {loading ? <p className="muted att-empty">Loading…</p>
                : students.length === 0 ? <p className="muted att-empty">No students enrolled in this batch.</p>
                : students.map((s) => {
                  const p = !!marks[s._id];
                  return (
                    <div key={s._id} className={`att-item ${p ? 'is-present' : ''}`}>
                      <span className="att-av">{(s.fullName || s.email)[0].toUpperCase()}</span>
                      <span className="att-name">{s.fullName || s.email}</span>
                      <div className="att-seg">
                        <button className={`att-segbtn ${p ? 'on-p' : ''}`} onClick={() => set(s._id, true)}>Present</button>
                        <button className={`att-segbtn ${!p ? 'on-a' : ''}`} onClick={() => set(s._id, false)}>Absent</button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="att-foot">
              <button className="btn ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn" onClick={save} disabled={saving || loading || students.length === 0}>{saving ? 'Saving…' : 'Save attendance'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Submissions({ assignmentId }) {
  const [subs, setSubs] = useState(null);
  const load = () => api(`/submissions/assignment/${assignmentId}`).then((d) => setSubs(d.submissions || [])).catch(() => setSubs([]));
  async function grade(id, score, feedback) { await api(`/submissions/${id}/grade`, { method: 'PATCH', body: { score, feedback } }); load(); }
  return (
    <div className="subs">
      {subs === null ? <button className="btn sm ghost" onClick={load}>View submissions</button> : (
        subs.length === 0 ? <p className="muted">No submissions yet.</p> :
          subs.map((s) => <GradeRow key={s._id} sub={s} onGrade={grade} />)
      )}
    </div>
  );
}

function GradeRow({ sub, onGrade }) {
  const [score, setScore] = useState(sub.score ?? '');
  const [feedback, setFeedback] = useState(sub.feedback || '');
  return (
    <div className="grade-row">
      <div><strong>{sub.studentId?.fullName || sub.studentId?.email}</strong>{sub.url && <> · <a href={sub.url} target="_blank" rel="noreferrer">link</a></>} <span className="badge">{sub.status}</span></div>
      <div className="inline-form">
        <select className="grade-score" value={score} onChange={(e) => setScore(e.target.value)}>
          <option value="">Score…</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} / 10</option>)}
        </select>
        <input placeholder="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button className="btn sm" onClick={() => onGrade(sub._id, score, feedback)}>Grade</button>
      </div>
    </div>
  );
}
