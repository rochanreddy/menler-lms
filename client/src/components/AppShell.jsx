import { NavLink, Outlet } from 'react-router-dom';
import { navFor } from '../nav.jsx';

// Wraps every logged-in page: role-specific left nav + top bar (avatar, name,
// role badge, notification bell, logout). Renders the active page via <Outlet>,
// passing { user, setUser, logout } down as Outlet context.
export default function AppShell({ user, setUser, logout }) {
  const tabs = navFor(user.role);
  const initial = (user.full_name || user.email || '?')[0].toUpperCase();

  return (
    <div className="app">
      <aside className="nav">
        <div className="brand">Menler LMS</div>
        {tabs.map((t) => (
          <NavLink
            key={t.path}
            to={`/app/${t.path}`}
            end={t.path === ''}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
        <button className="logout" onClick={logout}>Log out</button>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="spacer" />
          <span className="bell" title="Notifications (Phase 2)">🔔</span>
          <div className="who">
            <div className="avatar">{initial}</div>
            <span className="who-name">{user.full_name || user.email}</span>
            <span className={`badge badge-${user.role}`}>{user.role}</span>
          </div>
        </header>
        <main className="main">
          <Outlet context={{ user, setUser, logout }} />
        </main>
      </div>
    </div>
  );
}
