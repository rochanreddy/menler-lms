import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Empty, { Loading } from './Empty.jsx';
import { SubmissionCheckPanel } from './SubmissionCheck.jsx';
import AiReview from './AiReview.jsx';

// The assessment half of a batch: quiz results, the attendance modal, and the
// submission list a mentor grades from. Extracted from BatchWorkspace.jsx
// unchanged. Each fetches its own data on first open rather than loading with
// the workspace — a mentor opening a batch shouldn't pay for every submission
// in it before deciding which assignment to look at.

export function QuizResults({ quizId }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => api(`/quizzes/${quizId}/results`).then(setData).catch(() => setData({ attempts: [] }));

  // Fetch on first open only — reopening reuses what we already have.
  function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (!data) load();
  }

  const attempts = data?.attempts;
  return (
    <div className="subs">
      <button className="btn sm ghost" onClick={toggle}>
        {open ? 'Hide results' : 'View results'}
      </button>
      {open && (
        !data ? <Loading rows={2} inline /> :
          attempts.length === 0 ? <Empty inline icon="learning" title="Nobody has attempted this quiz yet." /> :
            attempts.map((a) => (
              <div key={a._id} className="grade-row">
                <strong>{a.studentId?.fullName || a.studentId?.email}</strong>
                <span className="badge badge-student">{a.score}/{a.total ?? data.quiz?.total}</span>
              </div>
            ))
      )}
    </div>
  );
}

export function Attendance({ session, students, onDone }) {
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef(null);

  // Lock the page behind the modal so scrolling stays inside it, move focus in,
  // hand it back on close, and let Escape dismiss (unless a save is in flight).
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    const opener = document.activeElement;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !saving) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open, saving]);

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
          <div className="att-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Attendance, ${session.title}`} onClick={(e) => e.stopPropagation()}>
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
                <button className="att-link" onClick={clearAll}>Clear</button>
              </div>
            </div>

            <div className="att-list">
              {loading ? <div className="att-empty"><Loading rows={4} inline /></div>
                : students.length === 0 ? <Empty inline icon="students" title="No students enrolled in this batch." hint="Add them from the roster before marking attendance." />
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
              <button className={`btn ${saving ? 'is-busy' : ''}`} onClick={save} disabled={saving || loading || students.length === 0}>{saving ? 'Saving…' : 'Save attendance'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Submissions({ assignmentId }) {
  const [subs, setSubs] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => api(`/submissions/assignment/${assignmentId}`).then((d) => setSubs(d.submissions || [])).catch(() => setSubs([]));
  async function grade(id, score, feedback) { await api(`/submissions/${id}/grade`, { method: 'PATCH', body: { score, feedback } }); load(); }
  async function recheck(id) { await api(`/submissions/${id}/recheck`, { method: 'POST' }); load(); }
  async function unlock(id) { await api(`/submissions/${id}/unlock`, { method: 'POST' }); load(); }

  // Fetch on first open only — reopening reuses what we already have.
  function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (subs === null) load();
  }

  return (
    <div className="subs">
      <button className="btn sm ghost" onClick={toggle}>
        {open ? 'Hide submissions' : 'View submissions'}
      </button>
      {open && (
        subs === null ? <Loading rows={2} inline /> :
          subs.length === 0 ? <Empty inline icon="grades" title="No submissions yet." hint="They appear here as students hand in their Drive folders." /> :
            subs.map((s) => <GradeRow key={s._id} sub={s} onGrade={grade} onRecheck={recheck} onUnlock={unlock} onReload={load} />)
      )}
    </div>
  );
}

function GradeRow({ sub, onGrade, onRecheck, onUnlock, onReload }) {
  const [score, setScore] = useState(sub.score ?? '');
  const [feedback, setFeedback] = useState(sub.feedback || '');
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);

  async function recheck() {
    setBusy(true);
    try { await onRecheck(sub._id); } finally { setBusy(false); }
  }

  // The AI review can only populate these two fields; saving stays manual.
  function applySuggestion({ score: s, feedback: f }) {
    setScore(String(s));
    if (f) setFeedback(f);
  }

  // Grading writes a score — guard against a double-click posting it twice.
  async function grade() {
    if (grading) return;
    setGrading(true);
    try { await onGrade(sub._id, score, feedback); } finally { setGrading(false); }
  }

  return (
    <div className="grade-row-stack">
      <div className="grade-row-top">
        <strong>{sub.studentId?.fullName || sub.studentId?.email}</strong>
        <span className={`badge ${sub.status === 'graded' ? 'badge-student' : sub.status === 'submitted' ? 'badge-submitted' : ''}`}>{sub.status}</span>
      </div>

      {/* Drive verification — its own block, independent of the grade below. */}
      <SubmissionCheckPanel
        submission={{ ...sub, driveLink: sub.driveLink || sub.url }}
        onRecheck={recheck}
        busy={busy}
      />

      {/* Automated review. Advisory: the only thing it can do to the form
          below is fill it in — the mentor still presses Grade. */}
      <AiReview submission={sub} onDone={onReload} onApply={applySuggestion} />

      <div className="inline-form">
        {sub.locked && <button type="button" className="btn sm ghost" onClick={() => onUnlock(sub._id)}>Unlock</button>}
        <label className="sr-only" htmlFor={`score-${sub._id}`}>Score</label>
        <select id={`score-${sub._id}`} className="grade-score" value={score} onChange={(e) => setScore(e.target.value)}>
          <option value="">Score…</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} / 10</option>)}
        </select>
        <label className="sr-only" htmlFor={`fb-${sub._id}`}>Feedback</label>
        <input id={`fb-${sub._id}`} placeholder="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button className={`btn sm ${grading ? 'is-busy' : ''}`} onClick={grade} disabled={grading}>{grading ? 'Saving…' : 'Grade'}</button>
      </div>
    </div>
  );
}
