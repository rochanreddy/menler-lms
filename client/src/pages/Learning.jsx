import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Learning has two tabs (per spec): Content (Program>Module>Chapter>Topic tree)
// and Assignments (submit + see grade). Projects share the assignments list.
export default function Learning() {
  const [tab, setTab] = useState('content');
  return (
    <div>
      <h1>Learning</h1>
      <div className="tabs">
        <button className={`tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>Content</button>
        <button className={`tab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>Assignments & Projects</button>
      </div>
      {tab === 'content' ? <Content /> : <Assignments />}
    </div>
  );
}

function Content() {
  const [programs, setPrograms] = useState([]);
  const [program, setProgram] = useState(null);
  const [topic, setTopic] = useState(null);
  const [open, setOpen] = useState({});

  useEffect(() => { api('/programs').then((d) => setPrograms(d.programs || [])).catch(() => {}); }, []);
  async function pick(id) { const { program: p } = await api(`/programs/${id}`); setProgram(p); setTopic(null); }
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div>
      <div className="learn-select">
        <label>Program{' '}
          <select value={program?._id || ''} onChange={(e) => e.target.value && pick(e.target.value)}>
            <option value="">Select a program…</option>
            {programs.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
          </select>
        </label>
      </div>

      {program && (
        <div className="learn-grid">
          <aside className="tree">
            {(program.modules || []).length === 0 && <p className="muted">No modules yet. An admin adds curriculum in Programs.</p>}
            {(program.modules || []).map((m) => (
              <div key={m._id} className="tree-mod">
                <div className="tree-row" onClick={() => toggle(m._id)}>▸ {m.title}</div>
                {open[m._id] && (m.chapters || []).map((c) => (
                  <div key={c._id} className="tree-chap">
                    <div className="tree-row" onClick={() => toggle(c._id)}>· {c.title}</div>
                    {open[c._id] && (c.topics || []).map((t) => (
                      <div key={t._id} className={`tree-topic ${topic?._id === t._id ? 'active' : ''}`} onClick={() => setTopic(t)}>{t.title}</div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </aside>

          <section className="viewer panel">
            {!topic && <p className="muted">Select a topic to view its content.</p>}
            {topic && (
              <>
                <h2>{topic.title}</h2>
                {topic.contentType === 'video' && topic.contentUrl && <video src={topic.contentUrl} controls style={{ width: '100%', borderRadius: 8 }} />}
                {topic.contentType === 'pdf' && topic.contentUrl && <a className="btn" href={topic.contentUrl} target="_blank" rel="noreferrer">Open PDF</a>}
                {topic.contentType === 'text' && <p style={{ whiteSpace: 'pre-wrap' }}>{topic.body}</p>}
                <button className="btn ghost" disabled title="Phase 3">Mark complete</button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Assignments() {
  const [items, setItems] = useState([]);
  const load = () => api('/assignments?scope=mine').then((d) => setItems(d.assignments || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  if (items.length === 0) return <p className="muted">No assignments yet. They appear once your mentor sets them.</p>;
  return (
    <div className="list">
      {items.map((a) => <AssignmentCard key={a._id} a={a} onChange={load} />)}
    </div>
  );
}

function AssignmentCard({ a, onChange }) {
  const sub = a.mySubmission;
  const [url, setUrl] = useState(sub?.url || '');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { await api(`/submissions/assignment/${a._id}`, { method: 'POST', body: { url } }); onChange(); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="row">
        <strong>{a.title}</strong>
        <span className="badge">{a.type}</span>
        {sub && <span className={`badge ${sub.status === 'graded' ? 'badge-student' : ''}`}>{sub.status}</span>}
      </div>
      {a.description && <p className="muted">{a.description}</p>}

      {sub?.status === 'graded' ? (
        <div className="graded">
          <div className="tile-value">{sub.score ?? '—'}</div>
          <div><strong>Score</strong>{sub.feedback && <p className="muted">“{sub.feedback}”</p>}</div>
        </div>
      ) : (
        <form className="inline-form" onSubmit={submit}>
          <input placeholder="Submission link (GitHub, Drive…)" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <button className="btn sm" disabled={busy}>{sub ? 'Re-submit' : 'Submit'}</button>
        </form>
      )}
    </div>
  );
}
