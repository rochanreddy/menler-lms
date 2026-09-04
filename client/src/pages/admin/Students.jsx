import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, mailNote } from '../../api.js';
import LineIcon from '../../components/LineIcon.jsx';
import Empty from '../../components/Empty.jsx';

// Admin: add students and see everyone. Add a student here (creates the account),
// or enrol them straight into a cohort under Batches (which also auto-creates).
export default function AdminStudents() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [form, setForm] = useState({ email: '', fullName: '', password: '' });
  const [temp, setTemp] = useState(null);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeQuery, setActiveQuery] = useState(''); // the query the shown list reflects
  const [listErr, setListErr] = useState('');

  const load = (q = '') => api(`/users?role=student${q ? `&search=${encodeURIComponent(q)}` : ''}`)
    .then((d) => setStudents(d.users || []))
    .catch(() => {})
    .finally(() => setActiveQuery(q));
  useEffect(() => { load(); api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {}); }, []);

  const shown = useMemo(
    () => students.filter((s) => !batchId || (s.batch_ids || []).includes(batchId)),
    [students, batchId],
  );

  async function create(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setTemp(null);
    setBusy(true);
    try {
      const res = await api('/users', { method: 'POST', body: { ...form, role: 'student' } });
      setTemp({ email: res.user.email, password: res.tempPassword, custom: res.custom, emailed: res.emailed, error: res.error });
      setForm({ email: '', fullName: '', password: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  // Irreversible, so the confirm spells out what goes and points at Block (on
  // the student's page) as the alternative that keeps the record.
  async function remove(s) {
    const who = s.full_name || s.email;
    if (!window.confirm(`Delete ${who}’s account?\n\nThis removes their login and everything recorded against them: submissions, quiz attempts, attendance and lesson progress. It cannot be undone.\n\nTo keep the record but shut them out, open the student and use “Block LMS access” instead.`)) return;
    setListErr('');
    try {
      await api(`/users/${s.id}`, { method: 'DELETE' });
      setStudents((list) => list.filter((x) => x.id !== s.id));
    } catch (e2) { setListErr(e2.message); }
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
          <input placeholder="Password (optional, auto if blank)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <button className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Adding…' : 'Add student'}</button>
        </div>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>They must change the password on first login. To also put them in a cohort, use Batches → Enrol student.</p>
        {err && <span className="error" role="alert">{err}</span>}
        {temp && (
          <div className="tempbox">
            <LineIcon name="check" size={15} className="tempbox-ic" /> Created <strong>{temp.email}</strong>, {temp.custom ? 'password' : 'temp password'}: <code>{temp.password}</code>
            <div className="muted">{mailNote(temp)} They'll set their own password on first login.</div>
          </div>
        )}
      </form>

      <form className="inline-form" style={{ marginTop: 'var(--space-5)' }} onSubmit={(e) => { e.preventDefault(); load(search); }}>
        <input placeholder="Search students by name or email" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 280 }} />
        <button className="btn sm ghost">Search</button>
        {batches.length > 0 && (
          <label>Batch{' '}
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">All batches</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
      </form>

      {listErr && <p className="error" role="alert">{listErr}</p>}
      <div className="list">
        {shown.map((s) => (
          <div className="panel list-row row-click" key={s.id} onClick={() => navigate(`/app/students/${s.id}`)}>
            <div>
              <strong>{s.full_name || '-'}</strong>
              {s.blocked?.lms && <span className="badge badge-blocked" style={{ marginLeft: 'var(--space-2)' }}>blocked</span>}
              <div className="muted">{s.email}</div>
            </div>
            <div className="row">
              <span className="badge badge-muted">{s.batch_ids?.length || 0} batch{(s.batch_ids?.length || 0) === 1 ? '' : 'es'}</span>
              <Link className="btn sm" to={`/app/students/${s.id}`}>Open</Link>
              <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); remove(s); }}>Delete</button>
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          activeQuery
            ? <Empty icon="students" title={`No matches for “${activeQuery}”.`} hint="Try a different name or email address." />
            : batchId
              ? <Empty icon="students" title="No students in this batch." hint="Try a different batch, or clear the filter." />
              : <Empty icon="students" title="No students yet." hint="Add one above, or enrol them straight into a cohort under Batches." />
        )}
      </div>
    </div>
  );
}
