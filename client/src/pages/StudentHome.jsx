import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';

// Student daily landing — now wired to live Phase 2 data:
// attendance %, assignments due, upcoming session.
export default function StudentHome() {
  const { user } = useOutletContext();
  const [att, setAtt] = useState({ pct: 0, present: 0, total: 0 });
  const [assignments, setAssignments] = useState([]);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    api('/attendance/me').then(setAtt).catch(() => {});
    api('/assignments?scope=mine').then((d) => setAssignments(d.assignments || [])).catch(() => {});
    api('/sessions?scope=upcoming').then((d) => setSessions(d.sessions || [])).catch(() => {});
  }, []);

  const due = assignments.filter((a) => !a.mySubmission).length;
  const projects = assignments.filter((a) => a.type === 'project').length;
  const next = sessions[0];

  const tiles = [
    { label: 'Active Class', value: next?.batchId?.name || '—' },
    { label: 'Attendance', value: att.total ? `${att.pct}%` : '—' },
    { label: 'Projects', value: String(projects) },
    { label: 'Assignments due', value: String(due) },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Student board</div>
          <h1>Welcome, {(user.full_name || user.email).split(' ')[0]}.</h1>
          <p>Your classes, attendance and work — all in one place.</p>
        </div>
      </div>

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
            ? <a className="sb-join" href={next.joinUrl} target="_blank" rel="noreferrer">Join Zoom →</a>
            : <span className="sb-join sb-join-off">Link coming soon</span>}
        </div>
      ) : (
        <div className="cta-banner">No live session scheduled yet — your mentor will post one here soon.</div>
      )}

      <div className="tiles">
        {tiles.map((t) => (
          <div className="tile" key={t.label}>
            <div className="tile-value">{t.value}</div>
            <div className="tile-label">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="home-row">
        <div className="panel">
          <h3>Upcoming class</h3>
          {next ? (
            <>
              <p><strong>{next.title}</strong><br /><span className="muted">{new Date(next.startsAt).toLocaleString()}</span></p>
              <a className="btn" href={next.joinUrl || '#'} target={next.joinUrl ? '_blank' : undefined} rel="noreferrer">Join</a>
            </>
          ) : <p className="muted">No session scheduled yet.</p>}
        </div>
        <div className="panel">
          <h3>Upcoming sessions</h3>
          {sessions.length === 0 && <p className="muted">Nothing scheduled.</p>}
          {sessions.slice(0, 4).map((s) => (
            <div key={s._id} className="mini-row">{s.title} <span className="muted">{new Date(s.startsAt).toLocaleDateString()}</span></div>
          ))}
        </div>
        <div className="panel">
          <h3>Attendance</h3>
          <div className="tile-value">{att.total ? `${att.pct}%` : '—'}</div>
          <p className="muted">{att.present}/{att.total} sessions attended</p>
        </div>
      </div>
    </div>
  );
}
