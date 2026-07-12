import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Admin: provision mentor accounts and list them. New mentors get a generated
// temp password shown once, for the admin to share.
export default function AdminMentors() {
  const [mentors, setMentors] = useState([]);
  const [form, setForm] = useState({ email: '', fullName: '', password: '' });
  const [temp, setTemp] = useState(null);
  const [reset, setReset] = useState(null); // { email, password } after a reset
  const [err, setErr] = useState('');

  const load = () => api('/users?role=mentor').then((d) => setMentors(d.users || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setErr('');
    setTemp(null);
    setReset(null);
    try {
      const res = await api('/users', { method: 'POST', body: { ...form, role: 'mentor' } });
      setTemp({ email: res.user.email, password: res.tempPassword, custom: res.custom });
      setForm({ email: '', fullName: '', password: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  }

  async function resetPassword(m) {
    setErr('');
    setTemp(null);
    setReset(null);
    if (!window.confirm(`Reset password for ${m.email}? Their current password stops working.`)) return;
    try {
      const res = await api(`/users/${m.id}/reset-password`, { method: 'POST' });
      setReset({ email: m.email, password: res.tempPassword });
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <div>
      <h1>Mentors</h1>

      <form className="panel" onSubmit={create}>
        <h3>Invite a mentor</h3>
        <div className="inline-form">
          <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          <input placeholder="Password (optional — auto if blank)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <button className="btn sm">Create mentor</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Leave password blank to auto-generate one. Either way, the mentor must change it on first login.</p>
        {err && <span className="error">{err}</span>}
        {temp && (
          <div className="tempbox">
            ✅ Created <strong>{temp.email}</strong> — {temp.custom ? 'password' : 'temp password'}: <code>{temp.password}</code>
            <div className="muted">Share this with the mentor; they'll be asked to set their own password on first login.</div>
          </div>
        )}
      </form>

      {reset && (
        <div className="tempbox">
          🔑 New password for <strong>{reset.email}</strong>: <code>{reset.password}</code>
          <div className="muted">Share it with the mentor; they change it after signing in.</div>
        </div>
      )}

      <div className="list">
        {mentors.map((m) => (
          <div className="panel list-row" key={m.id}>
            <div><strong>{m.full_name || '—'}</strong><div className="muted">{m.email}</div></div>
            <div className="row">
              <span className="badge badge-mentor">mentor</span>
              <button className="btn sm ghost" onClick={() => resetPassword(m)}>Reset password</button>
            </div>
          </div>
        ))}
        {mentors.length === 0 && <p className="muted">No mentors yet.</p>}
      </div>
    </div>
  );
}
