import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';

// Student daily landing. Tiles + upcoming class + stats. Attendance/assignments/
// project counts are placeholders until the Phase 2 backend (sessions,
// attendance, submissions) lands; program count is real.
export default function StudentHome() {
  const { user } = useOutletContext();
  const [programs, setPrograms] = useState([]);

  useEffect(() => {
    api('/programs').then((d) => setPrograms(d.programs || [])).catch(() => {});
  }, []);

  const tiles = [
    { label: 'Active Class', value: programs[0]?.title || '—' },
    { label: 'Attendance', value: '—%' },
    { label: 'Projects', value: '0' },
    { label: 'Assignments due', value: '0' },
  ];

  return (
    <div>
      <h1>Welcome, {user.full_name || user.email}</h1>

      <div className="cta-banner">
        Join the next session to crack your interview at your target company →
      </div>

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
          <p className="muted">No session scheduled yet. <span className="phase-inline">(Phase 2: sessions/calendar)</span></p>
          <button className="btn" disabled>Join</button>
        </div>
        <div className="panel">
          <h3>Calendar</h3>
          <p className="muted">Past · Present · Upcoming sessions. <span className="phase-inline">(Phase 2)</span></p>
        </div>
        <div className="panel">
          <h3>Progress</h3>
          <p className="muted">Milestone roadmap chart. <span className="phase-inline">(Phase 2)</span></p>
        </div>
      </div>
    </div>
  );
}
