import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, getToken, setToken, logoutSession } from './api.js';
import { navFor, extraRoutesFor } from './nav.jsx';
import AppShell from './components/AppShell.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForcePasswordChange from './pages/ForcePasswordChange.jsx';
import Blocked from './pages/Blocked.jsx';
import SignedOutElsewhere from './pages/SignedOutElsewhere.jsx';
import VerifyCertificate from './pages/VerifyCertificate.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(null); // message when the admin blocked this account
  // Set when this session was closed from elsewhere: another device signed in,
  // an admin revoked it, or the password changed. { message, reason }
  const [revoked, setRevoked] = useState(null);

  // On load, resolve the current user from a stored token (picks the dashboard).
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api('/me')
      .then((d) => setUser(d.user))
      .catch((e) => {
        if (e.code === 'blocked') setBlocked(e.message);
        else if (e.code === 'session_revoked') setRevoked({ message: e.message, reason: e.data?.reason });
        else setToken('');
      })
      .finally(() => setLoading(false));
  }, []);

  // An admin block takes effect on the next API call — api() broadcasts it so
  // the whole app swaps to the stop page immediately.
  useEffect(() => {
    const onBlocked = (e) => setBlocked(e.detail?.message || '');
    // The refresh token finally expired (or was revoked). api() has already
    // cleared storage; dropping the in-memory user is what shows the login page.
    const onSignedOut = () => setUser(null);
    // Someone signed in on another device (or this device was revoked). api()
    // has already cleared the tokens; this is what explains it rather than
    // dumping the user on a login form.
    const onRevoked = (e) => setRevoked({ message: e.detail?.message || '', reason: e.detail?.reason || '' });
    window.addEventListener('lms:blocked', onBlocked);
    window.addEventListener('lms:signed-out', onSignedOut);
    window.addEventListener('lms:session-revoked', onRevoked);
    return () => {
      window.removeEventListener('lms:blocked', onBlocked);
      window.removeEventListener('lms:signed-out', onSignedOut);
      window.removeEventListener('lms:session-revoked', onRevoked);
    };
  }, []);

  const logout = () => {
    // Tell the server first, while the token is still valid: a session left
    // open would go on counting as "in use on another device" for 20 minutes
    // and make the next sign-in ask about a browser that has already gone.
    // Fire-and-forget — a failed call must never trap someone in the app.
    if (getToken()) logoutSession();
    setToken('');
    setUser(null);
    setBlocked(null);
    setRevoked(null);
  };

  /* Certificate verification is public and stands apart from the app.
     It is opened by recruiters and admissions offices from a QR code on a
     printed certificate — people with no account, who did not choose to come
     here, and to whom every screen below this line is meaningless: the loading
     gate waits on a /me they will never have, "account blocked" and "signed
     out elsewhere" describe a session they do not hold, force-password-change
     hijacks the URL outright, and the catch-all at the foot of the router
     would bounce them to /login. So it is answered here, ahead of all of it.

     Read off window.location rather than a route param because this decision
     has to happen before the router renders anything. It is safe below the
     hooks above and above every early return that follows. */
  if (window.location.pathname.startsWith('/verify/')) {
    return (
      <Routes>
        <Route path="/verify/:code" element={<VerifyCertificate />} />
      </Routes>
    );
  }

  if (loading) return <div className="center">Loading…</div>;

  if (blocked !== null) return <Blocked message={blocked} onLogout={logout} />;

  if (revoked !== null) {
    return <SignedOutElsewhere message={revoked.message} reason={revoked.reason} onLogout={logout} />;
  }

  // Admin-provisioned / reset accounts must set their own password first.
  if (user && user.must_change_password) {
    return <ForcePasswordChange user={user} onDone={setUser} onLogout={logout} />;
  }

  const tabs = user ? navFor(user.role) : [];

  // Role-based access: a signed-in user whose role has no nav (retired roles
  // like 'partner', or anything unexpected) gets a stop page, not a blank app.
  if (user && tabs.length === 0) {
    return <Blocked message="Your account role no longer has access to this portal." onLogout={logout} />;
  }

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
        {user && extraRoutesFor(user.role).map((t) => (
          <Route key={t.path} path={t.path} element={<t.Component />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to={user ? '/app' : '/login'} />} />
    </Routes>
  );
}
