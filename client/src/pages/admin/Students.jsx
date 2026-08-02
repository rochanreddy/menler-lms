import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

// Admin: add students and see everyone. Add a student here (creates the account),
// or enrol them straight into a cohort under Batches (which also auto-creates).
export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ email: '', fullName: '', password: '' });
  const [temp, setTemp] = useState(null);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  const load = (q = '') => api(`/users?role=student${q ? `&search=${encodeURIComponent(q)}` : ''}`).then((d) => setStudents(d.users || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setErr('');
    setTemp(null);
    try {
      const res = await api('/users', { method: 'POST', body: { ...form, role: 'student' } });
      setTemp({ email: res.user.email, password: res.tempPassword, custom: res.custom });
      setForm({ email: '', fullName: '', password: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin board</div>
          <h1>Students</h1>
          <p>Add students, or enrol them into a cohort under Batches.</p>
        </div>
      </div>

      <form className="panel" onSubmit={create}>
        <h3>Add a student</h3>
        <div className="inline-form">
          <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          <input type="email" placeholder="Email (the one they enrolled with)" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          <input placeholder="Password (optional — auto if blank)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <button className="btn sm">Add student</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>They must change the password on first login. To also put them in a cohort, use Batches → Enrol student.</p>
        {err && <span className="error">{err}</span>}
        {temp && (
          <div className="tempbox">
            ✅ Created <strong>{temp.email}</strong> — {temp.custom ? 'password' : 'temp password'}: <code>{temp.password}</code>
            <div className="muted">Share it; they'll set their own password on first login.</div>
          </div>
        )}
      </form>

      <form className="inline-form" style={{ marginTop: 18 }} onSubmit={(e) => { e.preventDefault(); load(search); }}>
        <input placeholder="Search students by name or email" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 280 }} />
        <button className="btn sm ghost">Search</button>
      </form>

      <div className="list">
        {students.map((s) => (
          <div className="panel list-row" key={s.id}>
            <div>
              <strong>{s.full_name || '—'}</strong>
              {s.blocked?.lms && <span className="badge badge-blocked" style={{ marginLeft: 8 }}>blocked</span>}
              <div className="muted">{s.email}</div>
            </div>
            <div className="row">
              <span className="badge badge-student">{s.batch_ids?.length || 0} batch{(s.batch_ids?.length || 0) === 1 ? '' : 'es'}</span>
              <Link className="btn sm" to={`/app/students/${s.id}`}>Open</Link>
            </div>
          </div>
        ))}
        {students.length === 0 && <p className="muted">No students yet.</p>}
      </div>
    </div>
  );
}
