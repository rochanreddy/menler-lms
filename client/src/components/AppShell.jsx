import { NavLink, Outlet } from 'react-router-dom';
import { navFor } from '../nav.jsx';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';

// Wraps every logged-in page: icon sidebar (role-specific) + top bar. Renders
// the active page via <Outlet>, passing { user, setUser, logout } as context.
export default function AppShell({ user, setUser, logout }) {
  const tabs = navFor(user.role);
  const initial = (user.full_name || user.email || '?')[0].toUpperCase();

  return (
    <div className="app">
      <aside className="nav">
        <div className="brand"><span className="logo">🎓</span> Menler</div>
        {tabs.map((t) => (
          <NavLink key={t.path} to={t.path ? `/app/${t.path}` : '/app'} end={t.path === ''} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name={t.label} />{t.label}
          </NavLink>
        ))}
        <button className="logout" onClick={logout}><Icon name="logout" />Log out</button>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="spacer" />
          <NotificationBell />
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
