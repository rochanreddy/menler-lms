import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api.js';

// Student self-signup. Backend forces role=student; mentors/admins/partners are
// provisioned by an admin. On success it returns a token → straight into the app.
export default function Register({ onLogin }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { accessToken, user } = await api('/auth/register', { method: 'POST', body: form });
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
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1>Create your account</h1>
        <p className="muted">For students — join the Menler LMS</p>
        <input placeholder="Full name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required />
        <input type="email" placeholder="Email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        <input type="password" placeholder="Password (min 8 characters)" value={form.password} onChange={(e) => set('password', e.target.value)} minLength={8} required />
        {err && <div className="error">{err}</div>}
        <button disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="muted" style={{ textAlign: 'center' }}>Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
