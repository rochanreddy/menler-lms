import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mailNote } from '../../api.js';
import LineIcon from '../../components/LineIcon.jsx';
import Empty from '../../components/Empty.jsx';

const shortName = (n) => (n || '').replace(/^Demo[^A-Za-z0-9]+/, '');

// Admin: provision mentor accounts, list them, and manage which BATCHES each
// mentor runs. Batch assignment is what grants a mentor access to a batch
// (attendance, announcements, quizzes, grading) — so it lives right here.
export default function AdminMentors() {
  const [mentors, setMentors] = useState([]);
  const [batches, setBatches] = useState([]);
  const [filterBatchId, setFilterBatchId] = useState('');
  const [form, setForm] = useState({ email: '', fullName: '', password: '' });
  const [temp, setTemp] = useState(null);
  const [reset, setReset] = useState(null); // { email, password } after a reset
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('/users?role=mentor').then((d) => setMentors(d.users || [])).catch(() => {});
  const loadBatches = () => api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {});
  useEffect(() => { load(); loadBatches(); }, []);

  const runs = (mentorId) => batches.filter((b) => (b.mentorIds || []).includes(String(mentorId)));
  const shownMentors = filterBatchId ? mentors.filter((m) => runs(m.id).some((b) => b.id === filterBatchId)) : mentors;

  async function assignBatch(batchId, mentor) {
    setErr('');
    try { await api(`/batches/${batchId}/mentors`, { method: 'POST', body: { email: mentor.email } }); loadBatches(); }
    catch (e2) { setErr(e2.message); }
  }
  async function unassignBatch(batchId, mentorId) {
    setErr('');
    try { await api(`/batches/${batchId}/members/${mentorId}`, { method: 'DELETE' }); loadBatches(); }
    catch (e2) { setErr(e2.message); }
  }

  async function create(e) {
    e.preventDefault();
    if (busy) return;
    setErr(''); setTemp(null); setReset(null);
    setBusy(true);
    try {
      const res = await api('/users', { method: 'POST', body: { ...form, role: 'mentor' } });
      setTemp({ email: res.user.email, password: res.tempPassword, custom: res.custom, emailed: res.emailed, error: res.error });
      setForm({ email: '', fullName: '', password: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  async function resetPassword(m) {
    setErr(''); setTemp(null); setReset(null);
    if (!window.confirm(`Reset password for ${m.email}? Their current password stops working.`)) return;
    try {
      const res = await api(`/users/${m.id}/reset-password`, { method: 'POST' });
      setReset({ email: m.email, password: res.tempPassword, emailed: res.emailed, error: res.error });
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin board</div>
          <h1>Mentors</h1>
          <p>Invite mentors, assign their batches, and open one to edit or monitor.</p>
        </div>
      </div>

      <form className="panel" onSubmit={create}>
        <h3>Invite a mentor</h3>
        <div className="inline-form">
          <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          <input placeholder="Password (optional, auto if blank)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <button className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Creating…' : 'Create mentor'}</button>
        </div>
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>Leave password blank to auto-generate one. Either way, the mentor must change it on first login.</p>
        {err && <span className="error" role="alert">{err}</span>}
        {temp && (
          <div className="tempbox">
            <div className="tempbox-line"><span className="tempbox-ic"><LineIcon name="check" size={16} /></span><span>Created <strong>{temp.email}</strong>, {temp.custom ? 'password' : 'temp password'}: <code>{temp.password}</code>. {mailNote(temp)}</span></div>
            <div className="muted">Share this with the mentor; they'll be asked to set their own password on first login.</div>
          </div>
        )}
      </form>

      {reset && (
        <div className="tempbox">
          <div className="tempbox-line"><span className="tempbox-ic" style={{ color: 'var(--brand)' }}><LineIcon name="key" size={16} /></span><span>New password for <strong>{reset.email}</strong>: <code>{reset.password}</code>. {mailNote(reset)}</span></div>
          <div className="muted">Share it with the mentor; they change it after signing in.</div>
        </div>
      )}

      {batches.length > 0 && (
        <div className="inline-form" style={{ marginTop: 'var(--space-5)' }}>
          <label>Filter by batch{' '}
            <select value={filterBatchId} onChange={(e) => setFilterBatchId(e.target.value)}>
              <option value="">All batches</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{shortName(b.name)}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="list">
        {shownMentors.map((m) => {
          const mine = runs(m.id);
          const available = batches.filter((b) => !(b.mentorIds || []).includes(String(m.id)));
          return (
            <div className="panel" key={m.id}>
              <div className="list-row">
                <div>
                  <Link to={`/app/mentors/${m.id}`} className="member-name" style={{ fontSize: 'var(--text-base)' }}>{m.full_name || m.email}</Link>
                  {m.blocked?.lms && <span className="badge badge-blocked" style={{ marginLeft: 'var(--space-2)' }}>blocked</span>}
                  <div className="muted">{m.email}</div>
                </div>
                <div className="row">
                  <span className="badge badge-mentor">mentor</span>
                  <button className="btn sm ghost" onClick={() => resetPassword(m)}>Reset password</button>
                  <Link className="btn sm" to={`/app/mentors/${m.id}`}>Open</Link>
                </div>
              </div>

              <div className="mentor-batches">
                <span className="mentor-batches-label">Runs batches</span>
                <div className="chips">
                  {mine.map((b) => (
                    <span key={b.id} className="chip">{shortName(b.name)}<button type="button" className="chip-x" title="Unassign" onClick={() => unassignBatch(b.id, m.id)}>×</button></span>
                  ))}
                  {mine.length === 0 && <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>Not assigned to any batch yet.</span>}
                </div>
                {available.length > 0 && (
                  <select className="mentor-assign" value="" onChange={(e) => e.target.value && assignBatch(e.target.value, m)}>
                    <option value="">+ Assign to a batch…</option>
                    {available.map((b) => <option key={b.id} value={b.id}>{shortName(b.name)}{b.program ? ` · ${b.program}` : ''}</option>)}
                  </select>
                )}
              </div>
            </div>
          );
        })}
        {shownMentors.length === 0 && (
          mentors.length === 0
            ? <Empty icon="mentors" title="No mentors yet." hint="Create one with the form above. They get a temporary password and set their own on first sign-in." />
            : <Empty icon="mentors" title="No mentors run this batch." hint="Assign one from a mentor's card below, or clear the filter." />
        )}
      </div>
    </div>
  );
}
