import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import MenlerWordmark from '../components/MenlerWordmark.jsx';

// The demo accounts, as data — the box below fills the form from these instead
// of asking whoever's driving to retype a password from the screen.
const DEMOS = [
  { role: 'Admin', email: 'admin@menler.in', password: 'ChangeMe123!' },
  { role: 'Mentor', email: 'mentor@menler.in', password: 'mentor123' },
  { role: 'Student', email: 'aarav@demo.menler.in', password: 'student123' },
  { role: 'Partner', email: 'partner@menler.in', password: 'Partner123!' },
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { accessToken, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(accessToken);
      onLogin(user);
      nav('/app');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="auth-brand"><MenlerWordmark size={30} theme="dark" tagline /></div>
        <div className="auth-hero-copy">
          <h2>Learn AI. Build Real Products. Get Hired.</h2>
          <p>Master Claude and modern AI tools through hands-on fellowships, real-world projects, mentorship, and career support.</p>
        </div>
        <div />
      </div>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h1>Sign in to Menler</h1>
          <p className="sub">Welcome back — pick up exactly where you left off.</p>

          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            {/* Reveal toggle — mistyping a password you can't see is the single
                most common reason a sign-in fails twice in a row. */}
            <div className="field-with-action">
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="field-action" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
                {show ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.8 2.8" />
                    <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7a12 12 0 0 1-2.3 3.2" />
                    <path d="M6.2 6.7C4 8.2 3 10.5 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 3.6-.7" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" /><circle cx="12" cy="12" r="2.6" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>

          <div className="demo-box">
            <div className="eyebrow">Demo accounts — click to fill</div>
            {DEMOS.map((d) => (
              <button
                type="button"
                key={d.email}
                className="demo-row demo-row-btn"
                onClick={() => { setEmail(d.email); setPassword(d.password); setErr(''); }}
              >
                <span>{d.role}</span>
                <code>{d.email}</code>
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
