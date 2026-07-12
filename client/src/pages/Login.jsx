import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api.js';
import MenlerWordmark from '../components/MenlerWordmark.jsx';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <div className="auth-brand"><MenlerWordmark size={26} theme="dark" /></div>
        <div className="auth-hero-copy">
          <h2>Teach without the busywork.</h2>
          <p>Batches, attendance, quizzes, sessions and analytics — one board, zero spreadsheets.</p>
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
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>

          <p className="auth-alt">New student? <Link to="/signup">Create an account</Link></p>

          <div className="demo-box">
            <div className="eyebrow">Demo accounts</div>
            <div className="demo-row"><span>Admin</span><code>admin@menler.in / ChangeMe123!</code></div>
            <div className="demo-row"><span>Mentor</span><code>mentor@menler.in / mentor123</code></div>
            <div className="demo-row"><span>Student</span><code>aarav@demo.menler.in / student123</code></div>
          </div>
        </form>
      </div>
    </div>
  );
}
