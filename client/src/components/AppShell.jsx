import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { navFor } from '../nav.jsx';
import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import MenlerWordmark from './MenlerWordmark.jsx';

// Wraps every logged-in page: icon sidebar (role-specific) + top bar. On phones
// and small tablets the sidebar becomes an off-canvas drawer opened from a
// hamburger in the top bar. Renders the active page via <Outlet>.
export default function AppShell({ user, setUser, logout }) {
  const tabs = navFor(user.role);
  const initial = (user.full_name || user.email || '?')[0].toUpperCase();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Close the drawer whenever the route changes (i.e. a nav item was tapped).
  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [navOpen]);

  return (
    <div className="app">
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className={`nav ${navOpen ? 'open' : ''}`}>
        <div className="brand"><MenlerWordmark size={26} /></div>
        {tabs.map((t) => (
          <NavLink key={t.path} to={t.path ? `/app/${t.path}` : '/app'} end={t.path === ''} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name={t.label} />{t.label}
          </NavLink>
        ))}
        <button className="logout" onClick={logout}><Icon name="logout" />Log out</button>
      </aside>

      <div className="content">
        <header className="topbar">
          <button className="nav-toggle" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <div className="topbar-brand"><MenlerWordmark size={20} /></div>
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
