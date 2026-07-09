import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';

// Fully wired against GET/PATCH /api/lms/me. Sections from the spec:
// Personal · Educational · Professional · Resume.
export default function Profile() {
  const { user, setUser } = useOutletContext();
  const [form, setForm] = useState({
    fullName: user.full_name || '',
    phone: user.phone || '',
    education: user.education || {},
    professional: user.professional || {},
    resumeUrl: user.resume_url || '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setEdu = (k, v) => setForm((f) => ({ ...f, education: { ...f.education, [k]: v } }));
  const setPro = (k, v) => setForm((f) => ({ ...f, professional: { ...f.professional, [k]: v } }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const { user: updated } = await api('/me', { method: 'PATCH', body: form });
      setUser(updated);
      setMsg('Saved ✓');
    } catch (e2) {
      setMsg(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="stack">
      <h1>Profile</h1>

      <section className="panel">
        <h3>Personal</h3>
        <label>Full name<input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></label>
        <label>Email<input value={user.email} disabled /></label>
        <label>Phone<input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
      </section>

      <section className="panel">
        <h3>Educational</h3>
        <label>Degree<input value={form.education.degree || ''} onChange={(e) => setEdu('degree', e.target.value)} /></label>
        <label>Institution<input value={form.education.institution || ''} onChange={(e) => setEdu('institution', e.target.value)} /></label>
        <label>Year<input value={form.education.year || ''} onChange={(e) => setEdu('year', e.target.value)} /></label>
      </section>

      <section className="panel">
        <h3>Professional</h3>
        <label>Title<input value={form.professional.title || ''} onChange={(e) => setPro('title', e.target.value)} /></label>
        <label>Company<input value={form.professional.company || ''} onChange={(e) => setPro('company', e.target.value)} /></label>
        <label>Experience<input value={form.professional.experience || ''} onChange={(e) => setPro('experience', e.target.value)} /></label>
      </section>

      <section className="panel">
        <h3>Resume</h3>
        <label>Resume URL<input value={form.resumeUrl} onChange={(e) => set('resumeUrl', e.target.value)} placeholder="https://…" /></label>
        <p className="muted">File upload comes in Phase 2 (S3/Cloudinary). For now paste a link.</p>
      </section>

      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </form>
  );
}
