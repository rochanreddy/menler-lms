import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import LineIcon from '../../components/LineIcon.jsx';

const shortName = (n) => (n || '').replace(/^Demo — /, '');

// Admin: provision mentor accounts, list them, and manage which BATCHES each
// mentor runs. Batch assignment is what grants a mentor access to a batch
// (attendance, announcements, quizzes, grading) — so it lives right here.
export default function AdminMentors() {
  const [mentors, setMentors] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({ email: '', fullName: '', password: '' });
  const [temp, setTemp] = useState(null);
  const [reset, setReset] = useState(null); // { email, password } after a reset
  const [err, setErr] = useState('');

  const load = () => api('/users?role=mentor').then((d) => setMentors(d.users || [])).catch(() => {});
  const loadBatches = () => api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {});
  useEffect(() => { load(); loadBatches(); }, []);

  const runs = (mentorId) => batches.filter((b) => (b.mentorIds || []).includes(String(mentorId)));

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
    setErr(''); setTemp(null); setReset(null);
    try {
      const res = await api('/users', { method: 'POST', body: { ...form, role: 'mentor' } });
      setTemp({ email: res.user.email, password: res.tempPassword, custom: res.custom });
      setForm({ email: '', fullName: '', password: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  }

  async function resetPassword(m) {
    setErr(''); setTemp(null); setReset(null);
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
            <div className="tempbox-line"><span className="tempbox-ic"><LineIcon name="check" size={16} /></span><span>Created <strong>{temp.email}</strong> — {temp.custom ? 'password' : 'temp password'}: <code>{temp.password}</code></span></div>
            <div className="muted">Share this with the mentor; they'll be asked to set their own password on first login.</div>
          </div>
        )}
      </form>

      {reset && (
        <div className="tempbox">
          <div className="tempbox-line"><span className="tempbox-ic" style={{ color: 'var(--brand)' }}><LineIcon name="key" size={16} /></span><span>New password for <strong>{reset.email}</strong>: <code>{reset.password}</code></span></div>
          <div className="muted">Share it with the mentor; they change it after signing in.</div>
        </div>
      )}

      <div className="list">
        {mentors.map((m) => {
          const mine = runs(m.id);
          const available = batches.filter((b) => !(b.mentorIds || []).includes(String(m.id)));
          return (
            <div className="panel" key={m.id}>
              <div className="list-row">
                <div><strong>{m.full_name || '—'}</strong><div className="muted">{m.email}</div></div>
                <div className="row">
                  <span className="badge badge-mentor">mentor</span>
                  <button className="btn sm ghost" onClick={() => resetPassword(m)}>Reset password</button>
                </div>
              </div>

              <div className="mentor-batches">
                <span className="mentor-batches-label">Runs batches</span>
                <div className="chips">
                  {mine.map((b) => (
                    <span key={b.id} className="chip">{shortName(b.name)}<button type="button" className="chip-x" title="Unassign" onClick={() => unassignBatch(b.id, m.id)}>×</button></span>
                  ))}
                  {mine.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Not assigned to any batch yet.</span>}
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
        {mentors.length === 0 && <p className="muted">No mentors yet.</p>}
      </div>
    </div>
  );
}
