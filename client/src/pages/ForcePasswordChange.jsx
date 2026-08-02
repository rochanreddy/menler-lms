import { useState } from 'react';
import { api } from '../api.js';

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
    if (pw.length < 8) return setErr('Password must be at least 8 characters.');
    if (pw !== confirm) return setErr('Passwords do not match.');
    setBusy(true);
    try {
      const { user: updated } = await api('/me/password', { method: 'PATCH', body: { newPassword: pw } });
      onDone(updated);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="center">
      <form className="panel" style={{ width: 380 }} onSubmit={submit}>
        <div className="eyebrow">First login</div>
        <h1 style={{ fontSize: 24 }}>Set your password</h1>
        <p className="muted">Welcome, {user.full_name || user.email}. For security, choose your own password before continuing.</p>
        <div className="field" style={{ marginTop: 14 }}>
          <label>New password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} placeholder="Min 8 characters" required />
        </div>
        <div className="field">
          <label>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'Saving…' : 'Set password & continue'}</button>
        <p style={{ textAlign: 'center', marginTop: 14 }}>
          <button type="button" className="linklike" onClick={onLogout}>Log out</button>
        </p>
      </form>
    </div>
  );
}
