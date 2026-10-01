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

// Where a submission sits, for the filter and the row's chip. "fix" is a
// folder that failed the Drive check: nothing to grade until the student
// fixes it or a mentor rechecks.
const stageOf = (s) => (s.status === 'graded' ? 'graded'
  : s.checkStatus === 'NEEDS_FIXES' || s.checkStatus === 'CHECK_FAILED' ? 'fix' : 'todo');

const FILTERS = [
  { key: 'todo', label: 'To grade' },
  { key: 'graded', label: 'Graded' },
  { key: 'fix', label: 'Folder needs fixes' },
  { key: 'all', label: 'All' },
];

export function Submissions({ assignmentId }) {
  const [subs, setSubs] = useState(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(null); // null until the mentor picks one
  const [expanded, setExpanded] = useState(null);
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

  const counts = { todo: 0, graded: 0, fix: 0, all: subs?.length || 0 };
  for (const x of subs || []) counts[stageOf(x)] += 1;
  // Open on what needs doing; once everything is graded, show everything.
  const active = filter || (counts.todo ? 'todo' : 'all');
  const shown = (subs || []).filter((x) => active === 'all' || stageOf(x) === active);

  return (
    <div className="subs">
      <button className="btn sm ghost" onClick={toggle}>
        {open ? 'Hide submissions' : `View submissions${subs ? ` (${subs.length})` : ''}`}
      </button>
      {open && (
        subs === null ? <Loading rows={2} inline /> :
          subs.length === 0 ? <Empty inline icon="grades" title="No submissions yet." hint="They appear here as students hand in their Drive folders." /> : (
            <>
              <div className="subs-bar">
                <label className="subs-filter">
                  <span className="muted">Show</span>
                  <select value={active} onChange={(e) => { setFilter(e.target.value); setExpanded(null); }}>
                    {FILTERS.map((o) => <option key={o.key} value={o.key}>{o.label} ({counts[o.key]})</option>)}
                  </select>
                </label>
                <span className="muted">{counts.graded} of {counts.all} graded</span>
              </div>
              {shown.length === 0
                ? <Empty inline icon="grades" title={active === 'todo' ? 'Nothing waiting to be graded.' : 'Nothing here.'} />
                : shown.map((x) => (
                  <GradeRow
                    key={x._id}
                    sub={x}
                    open={expanded === x._id}
                    onToggle={() => setExpanded(expanded === x._id ? null : x._id)}
                    onGrade={grade}
                    onRecheck={recheck}
                    onUnlock={unlock}
                    onReload={load}
                  />
                ))}
            </>
          )
      )}
    </div>
  );
}

const STAGE_CHIP = {
  graded: { label: 'Graded', cls: 'badge-student' },
  todo: { label: 'To grade', cls: 'badge-submitted' },
  fix: { label: 'Needs fixes', cls: 'badge-fix' },
};

// One line per submission until it is opened — a batch of forty was forty
// stacked review panels. Only one is open at a time.
function GradeRow({ sub, open, onToggle, onGrade, onRecheck, onUnlock, onReload }) {
  const [score, setScore] = useState(sub.score ?? '');
  const [feedback, setFeedback] = useState(sub.feedback || '');
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);
  // A graded submission shows its grade, not an empty form asking for one.
  const [regrading, setRegrading] = useState(false);
  const stage = stageOf(sub);
  const isGraded = stage === 'graded';

  async function recheck() {
    setBusy(true);
    try { await onRecheck(sub._id); } finally { setBusy(false); }
  }

  // The AI review can only populate these two fields; saving stays manual.
  function applySuggestion({ score: s, feedback: f }) {
    setScore(String(s));
    if (f) setFeedback(f);
    if (isGraded) setRegrading(true);
  }

  // Grading writes a score — guard against a double-click posting it twice.
  async function grade() {
    if (grading) return;
    setGrading(true);
    try { await onGrade(sub._id, score, feedback); setRegrading(false); } finally { setGrading(false); }
  }

  const chip = STAGE_CHIP[stage];
  return (
    <div className={`grade-row-stack ${open ? 'is-open' : ''}`}>
      <button type="button" className="grade-sum" onClick={onToggle} aria-expanded={open}>
        <strong className="grade-sum-name">{sub.studentId?.fullName || sub.studentId?.email}</strong>
        <span className={`badge ${chip.cls}`}>{chip.label}</span>
        {isGraded && sub.score != null && (
          <span className="grade-sum-score">{sub.score}/10{sub.gradedBy === 'ai' ? ' · AI' : ''}</span>
        )}
        <span className="spacer" />
        <span className="grade-sum-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="grade-body">
          {/* Drive verification — its own block, independent of the grade below. */}
          <SubmissionCheckPanel
            submission={{ ...sub, driveLink: sub.driveLink || sub.url }}
            onRecheck={recheck}
            busy={busy}
          />

          {/* The AI review. The server grades from it fifteen minutes after
              hand-in; saving the form below regrades by hand. */}
          <AiReview submission={sub} onDone={onReload} onApply={applySuggestion} />

          {isGraded && !regrading ? (
            <div className="grade-done">
              <div className="grade-done-head">
                <strong>{sub.score != null ? `${sub.score}/10` : 'Graded'}</strong>
                <span className="muted">{sub.gradedBy === 'ai' ? 'graded by AI' : 'graded by a mentor'}</span>
                <span className="spacer" />
                {sub.locked && <button type="button" className="btn sm ghost" onClick={() => onUnlock(sub._id)}>Unlock</button>}
                <button type="button" className="btn sm ghost" onClick={() => setRegrading(true)}>Regrade</button>
              </div>
              {sub.feedback && <p className="grade-done-fb">{sub.feedback}</p>}
            </div>
          ) : stage === 'fix' ? null : (
            <div className="inline-form">
              <label className="sr-only" htmlFor={`score-${sub._id}`}>Score</label>
              <select id={`score-${sub._id}`} className="grade-score" value={score} onChange={(e) => setScore(e.target.value)}>
                <option value="">Score…</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} / 10</option>)}
              </select>
              <label className="sr-only" htmlFor={`fb-${sub._id}`}>Feedback</label>
              <input id={`fb-${sub._id}`} placeholder="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              <button className={`btn sm ${grading ? 'is-busy' : ''}`} onClick={grade} disabled={grading || score === ''}>{grading ? 'Saving…' : isGraded ? 'Save regrade' : 'Grade'}</button>
              {regrading && <button type="button" className="btn sm ghost" onClick={() => setRegrading(false)}>Cancel</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
