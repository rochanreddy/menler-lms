import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import MenlerWordmark from '../components/MenlerWordmark.jsx';
import { Alert, Button, Input, Stack, Text } from '../components/ui/index.js';

// The demo accounts, as data — the box below fills the form from these instead
// of asking whoever's driving to retype a password from the screen.
const DEMOS = [
  { role: 'Admin', email: 'admin@menler.in', password: 'ChangeMe123!' },
  { role: 'Mentor', email: 'mentor@menler.in', password: 'mentor123' },
  { role: 'Student', email: 'aarav@demo.menler.in', password: 'student123' },
];

// Working admin/mentor credentials must never render on a public production
// login. Shown in `vite dev`, and on a deliberate demo deployment that opts in
// with VITE_SHOW_DEMOS=true; stripped from an ordinary production build.
const SHOW_DEMOS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMOS === 'true';

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" /><circle cx="12" cy="12" r="2.6" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3l18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.8 2.8" />
    <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7a12 12 0 0 1-2.3 3.2" />
    <path d="M6.2 6.7C4 8.2 3 10.5 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 3.6-.7" />
  </svg>
);

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
      const { accessToken, refreshToken, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
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
      {/* The hero is pattern-layer, styled on the dark stage. It stays as-is:
          the token layer has no dark-surface text roles yet, so routing it
          through Text would render ink-on-indigo. */}
      <div className="auth-hero">
        <div className="auth-brand"><MenlerWordmark size={30} theme="dark" tagline /></div>
        <div className="auth-hero-copy">
          <h2><span>Learning that ships.</span><span>Credential that counts.</span><span>Outcomes that compound.</span></h2>
          <p>Build your AI native portfolio in 6 weeks.</p>
        </div>
        <div />
      </div>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <Stack gap="6">
            <Text role="heading-1">Welcome to Menler</Text>

            <Stack gap="4">
              <Input
                label="Email"
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Password"
                id="login-password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                // Mistyping a password you can't see is the single most common
                // reason a sign-in fails twice in a row.
                trailingAction={(
                  <button
                    type="button"
                    className="ui-input-action"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    title={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                )}
              />
            </Stack>

            {err && <Alert tone="error">{err}</Alert>}

            <Button type="submit" size="lg" loading={busy}>Sign in</Button>

            {SHOW_DEMOS && (
              <div className="demo-box">
                <div className="eyebrow">Demo accounts, select one to fill the form</div>
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
            )}
          </Stack>
        </form>
      </div>
    </div>
  );
}
