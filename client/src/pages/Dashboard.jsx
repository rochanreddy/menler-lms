import { useEffect, useState } from 'react';
import { api } from '../api.js';

// The nav tabs differ by role — straight from the canvas.
const NAV_BY_ROLE = {
  student: ['Home', 'Learning', 'Library', 'Forum', 'Job Board', 'Profile'],
  mentor: ['Home', 'Learning', 'Programs', 'Forum', 'Webinar', 'Profile'],
  admin: ['Home', 'Programs', 'Batches', 'Mentors', 'Forum'],
  partner: ['Jobs', 'Applicants', 'Profile'],
};

export default function Dashboard({ user, onLogout }) {
  const [programs, setPrograms] = useState([]);
  const tabs = NAV_BY_ROLE[user.role] || ['Home'];

  useEffect(() => {
    api('/programs').then((d) => setPrograms(d.programs || [])).catch(() => {});
  }, []);

  return (
    <div className="app">
      <aside className="nav">
        <div className="brand">Menler LMS</div>
        {tabs.map((t) => <div key={t} className="nav-item">{t}</div>)}
        <button className="logout" onClick={onLogout}>Log out</button>
      </aside>
      <main className="main">
        <h1>Welcome, {user.full_name || user.email}</h1>
        <span className={`badge badge-${user.role}`}>{user.role}</span>
        <p className="muted">This is your role-based dashboard. Phase 2 fills in each tab.</p>

        <section className="panel">
          <h2>Programs ({programs.length})</h2>
          <ul>
            {programs.map((p) => <li key={p._id}>{p.title} <span className="muted">— {p.modules?.length || 0} modules</span></li>)}
            {programs.length === 0 && <li className="muted">No programs yet. Run the seed script or create one as admin.</li>}
          </ul>
        </section>
      </main>
    </div>
  );
}
