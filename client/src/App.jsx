import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On load, if we have a token, resolve the current user (picks the dashboard).
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api('/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(''))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="center">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/app" /> : <Login onLogin={setUser} />} />
      <Route path="/app/*" element={user ? <Dashboard user={user} onLogout={() => { setToken(''); setUser(null); }} /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={user ? '/app' : '/login'} />} />
    </Routes>
  );
}
