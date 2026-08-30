import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Button, Input, Stack, Text } from '../components/ui/index.js';

// Shown right after login when the account was admin-provisioned or reset
// (must_change_password). Blocks the app until the user sets their own password.
export default function ForcePasswordChange({ user, onDone, onLogout }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) return setErr('That password is too short. Use at least 8 characters.');
    if (pw !== confirm) return setErr('Those passwords do not match. Retype them to continue.');
    setBusy(true);
    try {
      const { user: updated } = await api('/me/password', { method: 'PATCH', body: { newPassword: pw } });
      onDone(updated);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="center">
      {/* .auth-form carries the form measure already; the old inline width:380
          was a second copy of that same value. */}
      <form className="auth-form" onSubmit={submit}>
        <Stack gap="6">
          <Stack gap="2">
            <div className="eyebrow">First login</div>
            <Text role="heading-2">Set your password</Text>
            <Text role="body" tone="muted">
              Welcome, {user.full_name || user.email}. Choose your own password before continuing.
            </Text>
          </Stack>

          <Stack gap="4">
            <Input
              label="New password"
              id="fpc-new"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              minLength={8}
              required
              help="Use at least 8 characters."
            />
            <Input
              label="Confirm password"
              id="fpc-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Stack>

          {err && <Alert tone="error">{err}</Alert>}

          <Button type="submit" size="lg" loading={busy}>Set password</Button>

          <Text role="body" align="center">
            <Button variant="link" size="sm" onClick={onLogout}>Log out</Button>
          </Text>
        </Stack>
      </form>
    </div>
  );
}
