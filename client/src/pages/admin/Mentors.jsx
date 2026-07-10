import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Admin: provision mentor accounts and list them. New mentors get a generated
// temp password shown once, for the admin to share.
export default function AdminMentors() {
  const [mentors, setMentors] = useState([]);
  const [form, setForm] = useState({ email: '', fullName: '' });
  const [temp, setTemp] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api('/users?role=mentor').then((d) => setMentors(d.users || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setErr('');
    setTemp(null);
    try {
      const res = await api('/users', { method: 'POST', body: { ...form, role: 'mentor' } });
      setTemp({ email: res.user.email, password: res.tempPassword });
      setForm({ email: '', fullName: '' });
      load();
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
          <button className="btn sm">Create mentor</button>
        </div>
        {err && <span className="error">{err}</span>}
        {temp && (
          <div className="tempbox">
            ✅ Created <strong>{temp.email}</strong> — temp password: <code>{temp.password}</code>
            <div className="muted">Share this with the mentor; they change it after first login.</div>
          </div>
        )}
      </form>

      <div className="list">
        {mentors.map((m) => (
          <div className="panel list-row" key={m.id}>
            <div><strong>{m.full_name || '—'}</strong><div className="muted">{m.email}</div></div>
            <span className="badge badge-mentor">mentor</span>
          </div>
        ))}
        {mentors.length === 0 && <p className="muted">No mentors yet.</p>}
      </div>
    </div>
  );
}
