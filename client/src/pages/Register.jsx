import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api.js';
import MenlerWordmark from '../components/MenlerWordmark.jsx';
import { Alert, Button, Input, Stack, Text } from '../components/ui/index.js';

// Student self-signup. Backend forces role=student; mentors/admins are
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
      const { accessToken, refreshToken, user } = await api('/auth/register', { method: 'POST', body: form });
      setToken(accessToken, refreshToken);
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
      {/* Pattern-layer hero on the dark stage — see the note in Login.jsx. */}
      <div className="auth-hero">
        <div className="auth-brand"><MenlerWordmark size={30} theme="dark" tagline /></div>
        <div className="auth-hero-copy">
          <h2>Start learning with Menler.</h2>
          <p>Live sessions, quizzes, projects and mentor feedback — everything in one place.</p>
        </div>
        <div />
      </div>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <Stack gap="6">
            <Stack gap="2">
              <Text role="heading-1">Create your account</Text>
              <Text role="body" tone="muted">For students joining the Menler LMS.</Text>
            </Stack>

            <Stack gap="4">
              <Input
                label="Full name"
                id="reg-name"
                autoComplete="name"
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                required
              />
              <Input
                label="Email"
                id="reg-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                required
              />
              <Input
                label="Password"
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                minLength={8}
                required
                help="Use at least 8 characters."
              />
            </Stack>

            {err && <Alert tone="error">{err}</Alert>}

            <Button type="submit" size="lg" loading={busy}>Create account</Button>

            <Text role="body" tone="muted">
              Already have an account? <Link to="/login">Sign in</Link>
            </Text>
          </Stack>
        </form>
      </div>
    </div>
  );
}
