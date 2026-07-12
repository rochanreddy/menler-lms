import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import { navFor } from './nav.jsx';
import AppShell from './components/AppShell.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForcePasswordChange from './pages/ForcePasswordChange.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On load, resolve the current user from a stored token (picks the dashboard).
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api('/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(''))
      .finally(() => setLoading(false));
  }, []);

  const logout = () => { setToken(''); setUser(null); };

  if (loading) return <div className="center">Loading…</div>;

  // Admin-provisioned / reset accounts must set their own password first.
  if (user && user.must_change_password) {
    return <ForcePasswordChange user={user} onDone={setUser} onLogout={logout} />;
  }

  const tabs = user ? navFor(user.role) : [];

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/app" /> : <Login onLogin={setUser} />} />
      <Route path="/signup" element={user ? <Navigate to="/app" /> : <Register onLogin={setUser} />} />
      <Route
        path="/app"
        element={user ? <AppShell user={user} setUser={setUser} logout={logout} /> : <Navigate to="/login" />}
      >
        {tabs.map((t) => (
          <Route key={t.path} index={t.path === ''} path={t.path || undefined} element={<t.Component />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to={user ? '/app' : '/login'} />} />
    </Routes>
  );
}
