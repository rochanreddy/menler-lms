import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Partner home: post a job + see your postings with applicant counts.
export default function PostJob() {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({ title: '', company: '', location: '', description: '', applyUrl: '' });
  const [err, setErr] = useState('');

  const load = () => api('/jobs/mine').then((d) => setJobs(d.jobs || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function post(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/jobs', { method: 'POST', body: form });
      setForm({ title: '', company: '', location: '', description: '', applyUrl: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Partner board</div>
          <h1>Post a job</h1>
          <p>Reach Menler's AI-native talent pool.</p>
        </div>
      </div>

      <form className="panel stack" onSubmit={post}>
        <div className="inline-form">
          <input placeholder="Job title" value={form.title} onChange={(e) => set('title', e.target.value)} required />
          <input placeholder="Company" value={form.company} onChange={(e) => set('company', e.target.value)} required />
          <input placeholder="Location" value={form.location} onChange={(e) => set('location', e.target.value)} />
        </div>
        <div className="inline-form">
          <input style={{ flex: 1, minWidth: 300 }} placeholder="Short description" value={form.description} onChange={(e) => set('description', e.target.value)} />
          <input placeholder="Apply link (optional)" value={form.applyUrl} onChange={(e) => set('applyUrl', e.target.value)} />
          <button className="btn sm">Post job</button>
        </div>
        {err && <span className="error">{err}</span>}
      </form>

      <h2 style={{ marginTop: 28 }}>Your postings</h2>
      <div className="list">
        {jobs.map((j) => (
          <div key={j._id} className="panel list-row">
            <div><strong>{j.title}</strong> <span className="muted">· {j.company} · {j.location || 'Remote'}</span></div>
            <span className="badge">{j.applicantCount} applicant{j.applicantCount === 1 ? '' : 's'}</span>
          </div>
        ))}
        {jobs.length === 0 && <p className="muted">No postings yet.</p>}
      </div>
    </div>
  );
}
