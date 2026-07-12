import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';

// Student dashboard: next-session hero + Learning Journey timeline + progress
// stats + quiz-performance chart — all from the student's own live data.
export default function StudentHome() {
  const { user } = useOutletContext();
  const [att, setAtt] = useState({ pct: 0, present: 0, total: 0 });
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [program, setProgram] = useState(null);

  useEffect(() => {
    api('/attendance/me').then(setAtt).catch(() => {});
    api('/assignments?scope=mine').then((d) => setAssignments(d.assignments || [])).catch(() => {});
    api('/quizzes?scope=mine').then((d) => setQuizzes(d.quizzes || [])).catch(() => {});
    api('/sessions?scope=upcoming').then((d) => setSessions(d.sessions || [])).catch(() => {});
    // enrolled program → used for the journey milestones
    Promise.all([api('/batches'), api('/programs')]).then(([bd, pd]) => {
      const progId = (bd.batches || [])[0]?.programId;
      const p = (pd.programs || []).find((x) => x._id === progId) || (pd.programs || [])[0];
      setProgram(p || null);
    }).catch(() => {});
  }, []);

  // Clicking Join records attendance (backend only counts it within the session
  // window) and refreshes the attendance tile. The link still opens normally.
  const markJoin = (id) => api(`/attendance/join/${id}`, { method: 'POST' })
    .then(() => api('/attendance/me').then(setAtt)).catch(() => {});

  const next = sessions[0];
  const assignmentsDone = assignments.filter((a) => a.mySubmission).length;
  const quizzesDone = quizzes.filter((q) => q.myAttempt).length;
  const quizScores = quizzes.filter((q) => q.myAttempt && q.myAttempt.total)
    .map((q) => ({ name: q.title, pct: Math.round((q.myAttempt.score / q.myAttempt.total) * 100) }));
  const avgScore = quizScores.length ? Math.round(quizScores.reduce((a, b) => a + b.pct, 0) / quizScores.length) : null;

  // Overall progress = average of the signals we actually have.
  const signals = [];
  if (att.total) signals.push(att.pct);
  if (assignments.length) signals.push(Math.round((assignmentsDone / assignments.length) * 100));
  if (quizzes.length) signals.push(Math.round((quizzesDone / quizzes.length) * 100));
  const progress = signals.length ? Math.round(signals.reduce((a, b) => a + b, 0) / signals.length) : 0;

  // Journey milestones: Enrolled → each module → Certificate.
  const moduleLabels = (program?.modules || []).map((m) => (m.title.split('·')[0] || m.title).trim());
  const milestones = ['Enrolled', ...moduleLabels, 'Certificate'];
  const doneUpTo = Math.max(0, Math.round((progress / 100) * (milestones.length - 1)));
  const fillPct = milestones.length > 1 ? (doneUpTo / (milestones.length - 1)) * 100 : 0;

  const tiles = [
    { label: 'Course progress', value: `${progress}%` },
    { label: 'Attendance', value: att.total ? `${att.pct}%` : '—' },
    { label: 'Assignments', value: `${assignmentsDone}/${assignments.length}` },
    { label: 'Quizzes', value: `${quizzesDone}/${quizzes.length}` },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Student board</div>
          <h1>Welcome, {(user.full_name || user.email).split(' ')[0]}.</h1>
          <p>Your live sessions, journey and progress — all in one place.</p>
        </div>
      </div>

      {/* Next session hero */}
      {next ? (
        <div className="cta-banner session-banner">
          <div>
            <div className="sb-label">🎥 Upcoming live session</div>
            <div className="sb-title">{next.title}</div>
            <div className="sb-time">
              {new Date(next.startsAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {next.batchId?.name ? ` · ${next.batchId.name.replace(/^Demo — /, '')}` : ''}
            </div>
          </div>
          {next.joinUrl
            ? <a className="sb-join" href={next.joinUrl} target="_blank" rel="noreferrer" onClick={() => markJoin(next._id)}>Join Zoom →</a>
            : <span className="sb-join sb-join-off">Link coming soon</span>}
        </div>
      ) : (
        <div className="cta-banner">No live session scheduled yet — your mentor will post one here soon.</div>
      )}

      {/* Learning journey */}
      <div className="panel">
        <div className="eyebrow">🚀 Learning journey</div>
        <h2>{program?.title || 'Your course'} · {progress}% complete</h2>
        <div className="journey" style={{ marginTop: 24 }}>
          {milestones.map((m, i) => (
            <div key={`${m}-${i}`} className={`journey-step ${i <= doneUpTo ? 'done' : ''}`}>
              <div className="journey-dot">{i <= doneUpTo ? '✓' : ''}</div>
              <div className="journey-label">{m}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress stat tiles */}
      <div className="tiles" style={{ marginTop: 22 }}>
        {tiles.map((t) => (
          <div className="tile" key={t.label}>
            <div className="tile-value">{t.value}</div>
            <div className="tile-label">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Quiz performance + upcoming sessions */}
      <div className="home-row" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="panel">
          <div className="eyebrow">Quiz performance</div>
          <h2>Your scores{avgScore !== null ? ` · avg ${avgScore}%` : ''}</h2>
          {quizScores.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>No quizzes attempted yet — take one in Learning → Quizzes.</p>
          ) : (
            <div className="chart" style={{ marginTop: 20, height: 200 }}>
              {[100, 75, 50, 25].map((g) => <div key={g} className="chart-grid"><span style={{ bottom: `${g}%` }}>{g}%</span></div>)}
              {quizScores.map((q) => (
                <div className="bar-col" key={q.name}>
                  <div className="bar-val">{q.pct}%</div>
                  <div className="bar" style={{ height: `${q.pct}%` }} />
                  <div className="bar-name">{q.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="eyebrow">Upcoming sessions</div>
          <h2>What's next</h2>
          <div style={{ marginTop: 10 }}>
            {sessions.length === 0 && <p className="muted">Nothing scheduled yet.</p>}
            {sessions.slice(0, 5).map((s) => (
              <div key={s._id} className="mini-row">
                <strong>{s.title}</strong>
                <span className="muted"> · {new Date(s.startsAt).toLocaleDateString()}</span>
                {s.joinUrl && <> · <a className="zoom-link" href={s.joinUrl} target="_blank" rel="noreferrer" onClick={() => markJoin(s._id)}>Join</a></>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
