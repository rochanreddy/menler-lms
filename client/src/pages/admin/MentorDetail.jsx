import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api.js';
import Empty from '../../components/Empty.jsx';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Admin drill-down into one mentor: edit their profile, see the batches they
// run and every student sitting under them, block/unblock their LMS access or
// individual courses.
export default function MentorDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null); // { fullName, phone, email } while editing
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => api(`/users/${id}/overview`).then((d) => { setData(d); setForm(null); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  async function setBlocks(body, okMsg) {
    setErr('');
    try { await api(`/users/${id}/blocks`, { method: 'PATCH', body }); await load(); flash(okMsg); }
    catch (e) { setErr(e.message); }
  }

  async function toggleLms() {
    const isBlocked = data.user.blocked?.lms;
    if (isBlocked) return setBlocks({ lms: false, reason: '' }, 'Mentor unblocked');
    const reason = window.prompt('Block this mentor from the entire LMS?\nOptional reason (shown to the mentor):');
    if (reason === null) return;
    return setBlocks({ lms: true, reason }, 'Mentor blocked');
  }

  function toggleBatch(batchId, blocked) {
    const ids = new Set(data.user.blocked?.batch_ids || []);
    if (blocked) ids.delete(String(batchId)); else ids.add(String(batchId));
    return setBlocks({ batchIds: [...ids] }, blocked ? 'Course unblocked' : 'Course blocked');
  }

  async function saveProfile(e) {
    e.preventDefault();
    setErr('');
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: form });
      await load();
      flash('Profile saved');
    } catch (e2) { setErr(e2.message); }
  }

  async function resetPassword() {
    if (!window.confirm(`Reset password for ${data.user.email}?`)) return;
    try {
      const r = await api(`/users/${id}/reset-password`, { method: 'POST' });
      window.alert(`New temp password for ${data.user.email}: ${r.tempPassword}`);
    } catch (e) { setErr(e.message); }
  }

  if (err && !data) return <p className="error">{err}</p>;
  if (!data) return <div className="skeleton-stack"><div className="skeleton-row" /><div className="skeleton-row tall" /><div className="skeleton-row tall" /></div>;

  const u = data.user;
  const lmsBlocked = u.blocked?.lms;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/app/mentors" className="crumb">← All mentors</Link>
          <h1 style={{ marginTop: 4 }}>
            {u.full_name || u.email}
            <span className="badge badge-mentor" style={{ marginLeft: 10 }}>mentor</span>
            {lmsBlocked && <span className="badge badge-blocked" style={{ marginLeft: 6 }}>blocked</span>}
          </h1>
          <p className="muted">{u.email}{u.phone ? ` · ${u.phone}` : ''} · joined {fmtDate(u.created_at)} · last active {fmtDate(u.last_active_at)}</p>
        </div>
        <div className="row">
          {msg && <span className="ws-flash">{msg}</span>}
          <button className="btn sm ghost" onClick={resetPassword}>Reset password</button>
          <button className={`btn sm ${lmsBlocked ? '' : 'danger'}`} onClick={toggleLms}>
            {lmsBlocked ? 'Unblock LMS access' : 'Block LMS access'}
          </button>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      {lmsBlocked && (
        <div className="blockbox">
          This mentor is blocked from the entire LMS{u.blocked.reason ? ` — “${u.blocked.reason}”` : ''}. They cannot log in until unblocked.
        </div>
      )}

      {/* Edit profile */}
      <section className="panel" style={{ marginTop: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Profile</h3>
          {!form && <button className="btn sm ghost" onClick={() => setForm({ fullName: u.full_name || '', phone: u.phone || '', email: u.email })}>Edit</button>}
        </div>
        {!form ? (
          <div className="muted" style={{ marginTop: 8 }}>
            <div><strong style={{ color: 'var(--ink)' }}>{u.full_name || '—'}</strong></div>
            <div>{u.email}</div>
            <div>{u.phone || 'No phone on file'}</div>
          </div>
        ) : (
          <form className="inline-form" style={{ marginTop: 10 }} onSubmit={saveProfile}>
            <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <button className="btn sm">Save</button>
            <button type="button" className="btn sm ghost" onClick={() => setForm(null)}>Cancel</button>
          </form>
        )}
      </section>

      {/* Batches they run — with per-course block */}
      <section className="panel" style={{ marginTop: 18 }}>
        <h3>Runs batches</h3>
        {data.batches.length === 0 && <p className="muted">Not assigned to any batch. Assign one from the Mentors list.</p>}
        {data.batches.map((b) => (
          <div key={b.id} className={`detail-row ${b.blocked ? 'is-blocked' : ''}`}>
            <div>
              <strong>{b.name}</strong> {b.blocked && <span className="badge badge-blocked">course blocked</span>}
              <div className="muted">{b.program} · {b.status} · {b.studentCount} students · {b.mentorCount} mentors</div>
            </div>
            <button className={`btn sm ${b.blocked ? 'ghost' : 'danger ghost-danger'}`} onClick={() => toggleBatch(b.id, b.blocked)}>
              {b.blocked ? 'Unblock course' : 'Block course'}
            </button>
          </div>
        ))}
      </section>

      {/* Every student under this mentor */}
      <section className="panel" style={{ marginTop: 18 }}>
        <h3>Students under this mentor</h3>
        {(!data.students || data.students.length === 0) ? <Empty inline icon="students" title="No students yet." hint="Students in this mentor’s batches are listed here." /> : (
          <div className="table-wrap">
            <table className="grade-table">
              <thead><tr><th>Student</th><th>Email</th><th>Status</th><th>Last active</th><th></th></tr></thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.full_name || '—'}</td>
                    <td>{s.email}</td>
                    <td>{s.blocked ? <span className="badge badge-blocked">blocked</span> : <span className="badge badge-student">active</span>}</td>
                    <td>{fmtDate(s.last_active_at)}</td>
                    <td><Link className="btn sm ghost" to={`/app/students/${s.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
