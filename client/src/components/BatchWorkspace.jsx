import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Shared batch detail used by admin + mentor.
// - admin mode: assign mentor, enroll student, schedule sessions.
// - mentor mode: schedule sessions, mark attendance, set assignments, grade.
export default function BatchWorkspace({ batchId, mode }) {
  const [batch, setBatch] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [msg, setMsg] = useState('');

  const loadBatch = () => api(`/batches/${batchId}`).then((d) => setBatch(d.batch)).catch(() => {});
  const loadSessions = () => api(`/sessions?batchId=${batchId}`).then((d) => setSessions(d.sessions || [])).catch(() => {});
  const loadAssignments = () => api(`/assignments?batchId=${batchId}`).then((d) => setAssignments(d.assignments || [])).catch(() => {});
  const loadQuizzes = () => api(`/quizzes?batchId=${batchId}`).then((d) => setQuizzes(d.quizzes || [])).catch(() => {});
  useEffect(() => { loadBatch(); loadSessions(); loadAssignments(); loadQuizzes(); }, [batchId]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  async function act(fn, okMsg) { try { await fn(); flash(okMsg); } catch (e) { flash(e.message); } }

  if (!batch) return <p className="muted">Loading batch…</p>;

  return (
    <div className="stack">
      <div className="row"><h2 style={{ margin: 0 }}>{batch.name}</h2><span className="badge">{batch.status}</span>{msg && <span className="muted">{msg}</span>}</div>

      {/* Roster */}
      <section className="panel">
        <h3>Roster</h3>
        <div className="roster">
          <div>
            <strong>Mentors ({batch.mentorIds.length})</strong>
            {batch.mentorIds.map((m) => <div key={m._id} className="chip">{m.fullName || m.email}</div>)}
          </div>
          <div>
            <strong>Students ({batch.studentIds.length})</strong>
            {batch.studentIds.map((s) => <div key={s._id} className="chip">{s.fullName || s.email}</div>)}
            {batch.studentIds.length === 0 && <p className="muted">None yet.</p>}
          </div>
        </div>

        {mode === 'admin' && (
          <div className="row" style={{ marginTop: 12 }}>
            <EmailAdd label="Assign mentor" onAdd={(email) => act(() => api(`/batches/${batchId}/mentors`, { method: 'POST', body: { email } }).then(loadBatch), 'Mentor assigned')} />
            <EmailAdd label="Enroll student" onAdd={(email) => act(() => api(`/batches/${batchId}/students`, { method: 'POST', body: { email } }).then(loadBatch), 'Student enrolled')} />
          </div>
        )}
      </section>

      {/* Sessions — with Zoom link */}
      <section className="panel">
        <h3>Sessions & Zoom links</h3>
        <SessionForm onAdd={(body) => act(() => api('/sessions', { method: 'POST', body: { batchId, ...body } }).then(loadSessions), 'Session scheduled')} />
        {sessions.map((s) => (
          <div key={s._id} className="list-row" style={{ marginTop: 8 }}>
            <div>
              <strong>{s.title}</strong> <span className="muted">{new Date(s.startsAt).toLocaleString()}</span>
              {s.joinUrl
                ? <> · <a href={s.joinUrl} target="_blank" rel="noreferrer" className="zoom-link">🎥 Join Zoom</a></>
                : <span className="muted"> · no link</span>}
            </div>
            {mode === 'mentor' && <Attendance sessionId={s._id} students={batch.studentIds} onDone={() => flash('Attendance saved')} />}
          </div>
        ))}
        {sessions.length === 0 && <p className="muted">No sessions yet.</p>}
      </section>

      {/* Assignments + grading (mentor) */}
      <section className="panel">
        <h3>Assignments & Projects</h3>
        {mode === 'mentor' && (
          <AssignmentForm onAdd={(body) => act(() => api('/assignments', { method: 'POST', body: { batchId, ...body } }).then(loadAssignments), 'Assignment created')} />
        )}
        {assignments.map((a) => (
          <div key={a._id} className="assignment">
            <div className="row"><strong>{a.title}</strong><span className="badge">{a.type}</span></div>
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
    </div>
  );
}

function EmailAdd({ label, onAdd }) {
  const [email, setEmail] = useState('');
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); onAdd(email); setEmail(''); }}>
      <input placeholder={`${label} — email`} value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn sm">{label}</button>
    </form>
  );
}

function SessionForm({ onAdd }) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (title && startsAt) { onAdd({ title, startsAt: new Date(startsAt).toISOString(), joinUrl }); setTitle(''); setStartsAt(''); setJoinUrl(''); } }}>
      <input placeholder="Session title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      <input placeholder="Zoom link (https://…)" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} />
      <button className="btn sm">Add session</button>
    </form>
  );
}

// Mentor quiz author: title/type + a growing list of questions, each with
// options and a "correct" radio.
function QuizBuilder({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('quiz');
  const [questions, setQuestions] = useState([{ text: '', options: ['', ''], correctIndex: 0 }]);

  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const setOpt = (qi, oi, val) => setQ(qi, { options: questions[qi].options.map((o, idx) => (idx === oi ? val : o)) });
  const addOption = (qi) => setQ(qi, { options: [...questions[qi].options, ''] });
  const addQuestion = () => setQuestions((qs) => [...qs, { text: '', options: ['', ''], correctIndex: 0 }]);

  function submit(e) {
    e.preventDefault();
    const clean = questions
      .map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) }))
      .filter((q) => q.text.trim() && q.options.length >= 2);
    if (!title.trim() || clean.length === 0) return;
    onCreate({ title, type, questions: clean });
    setTitle(''); setType('quiz'); setQuestions([{ text: '', options: ['', ''], correctIndex: 0 }]); setOpen(false);
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
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn sm ghost" onClick={addQuestion}>+ question</button>
        <button className="btn sm" type="submit">Post quiz</button>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Tick the radio next to the correct option.</p>
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
  const [title, setTitle] = useState('');
  const [type, setType] = useState('assignment');
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (title) { onAdd({ title, type }); setTitle(''); } }}>
      <input placeholder="Assignment title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select value={type} onChange={(e) => setType(e.target.value)}><option value="assignment">Assignment</option><option value="project">Project</option></select>
      <button className="btn sm">Add</button>
    </form>
  );
}

function Attendance({ sessionId, students, onDone }) {
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState({});
  async function save() {
    const records = students.map((s) => ({ studentId: s._id, status: marks[s._id] ? 'present' : 'absent' }));
    await api(`/attendance/session/${sessionId}`, { method: 'POST', body: { records } });
    setOpen(false); onDone();
  }
  if (!open) return <button className="btn sm ghost" onClick={() => setOpen(true)}>Mark attendance</button>;
  return (
    <div className="attend">
      {students.map((s) => (
        <label key={s._id} className="attend-row">
          <input type="checkbox" checked={!!marks[s._id]} onChange={(e) => setMarks((m) => ({ ...m, [s._id]: e.target.checked }))} />
          {s.fullName || s.email}
        </label>
      ))}
      <button className="btn sm" onClick={save}>Save</button>
    </div>
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
        <input style={{ width: 70 }} placeholder="Score" value={score} onChange={(e) => setScore(e.target.value)} />
        <input placeholder="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button className="btn sm" onClick={() => onGrade(sub._id, score, feedback)}>Grade</button>
      </div>
    </div>
  );
}
