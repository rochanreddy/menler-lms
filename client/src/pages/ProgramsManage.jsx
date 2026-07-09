import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';

// Admin: create + list programs (wired to POST/GET /api/lms/programs).
// Mentor: read-only list of programs/batches (batch grading arrives in Phase 2).
export default function ProgramsManage() {
  const { user } = useOutletContext();
  const isAdmin = user.role === 'admin';
  const [programs, setPrograms] = useState([]);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');

  const load = () => api('/programs').then((d) => setPrograms(d.programs || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/programs', { method: 'POST', body: { title } });
      setTitle('');
      load();
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <div>
      <h1>Programs</h1>

      {isAdmin && (
        <form className="panel row" onSubmit={create}>
          <input placeholder="New program title (e.g. Kickstarter)" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <button className="btn">Create</button>
          {err && <span className="error">{err}</span>}
        </form>
      )}

      <div className="list">
        {programs.map((p) => (
          <div className="panel list-row" key={p._id}>
            <div>
              <strong>{p.title}</strong>
              <div className="muted">{p.modules?.length || 0} modules · {p.published ? 'published' : 'draft'}</div>
            </div>
            <span className="muted">Batches & curriculum editor — Phase 2</span>
          </div>
        ))}
        {programs.length === 0 && <p className="muted">No programs yet.{isAdmin ? ' Create one above.' : ''}</p>}
      </div>
    </div>
  );
}
