import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import Empty from '../components/Empty.jsx';

const CATEGORIES = ['PPT', 'eBook', 'Note', 'Library'];

// Downloadable resource library. Everyone browses; admin/mentor add by link.
export default function Library() {
  const { user } = useOutletContext();
  const canAdd = user.role === 'admin' || user.role === 'mentor';
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState({ title: '', category: 'Note', url: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api('/library').then((d) => setItems(d.items || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!form.title.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/library', { method: 'POST', body: form });
      setForm({ title: '', category: 'Note', url: '', description: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  const shown = filter === 'All' ? items : items.filter((i) => i.category === filter);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Library</div>
          <h1>Resources</h1>
          <p>Slides, eBooks and notes — everything to go deeper.</p>
        </div>
      </div>

      {canAdd && (
        <form className="panel" onSubmit={add}>
          <h3>Add a resource</h3>
          <div className="inline-form">
            <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input placeholder="Link (Drive, PDF…)" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
            <button className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
          </div>
          {err && <span className="error" role="alert">{err}</span>}
        </form>
      )}

      <div className="tabs" style={{ marginTop: 18 }}>
        {['All', ...CATEGORIES].map((c) => (
          <button key={c} className={`tab ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>{c}</button>
        ))}
      </div>

      <div className="lib-grid">
        {shown.map((i) => (
          <a key={i._id} className="lib-card" href={i.url || '#'} target={i.url ? '_blank' : undefined} rel="noreferrer">
            <span className="badge">{i.category}</span>
            <strong>{i.title}</strong>
            {i.description && <p className="muted">{i.description}</p>}
            <span className="lib-open">{i.url ? 'Open →' : 'No link'}</span>
          </a>
        ))}
        {shown.length === 0 && <Empty icon="library" title="Nothing in the library yet." hint="Reading material, recordings and templates your mentors share end up here." />}
      </div>
    </div>
  );
}
