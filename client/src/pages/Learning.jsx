import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Program → Module → Chapter → Topic tree (left) + content viewer (right),
// reading the live /api/lms/programs API. Read-only for now; "mark complete"
// and progress persistence arrive in Phase 2.
export default function Learning() {
  const [programs, setPrograms] = useState([]);
  const [program, setProgram] = useState(null);
  const [topic, setTopic] = useState(null);
  const [open, setOpen] = useState({}); // expanded module/chapter ids

  useEffect(() => {
    api('/programs').then((d) => setPrograms(d.programs || [])).catch(() => {});
  }, []);

  async function pick(id) {
    const { program: p } = await api(`/programs/${id}`);
    setProgram(p);
    setTopic(null);
  }
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div>
      <h1>Learning</h1>
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
                      <div key={t._id} className={`tree-topic ${topic?._id === t._id ? 'active' : ''}`} onClick={() => setTopic(t)}>
                        {t.title}
                      </div>
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
                {topic.contentType === 'video' && topic.contentUrl && (
                  <video src={topic.contentUrl} controls style={{ width: '100%', borderRadius: 8 }} />
                )}
                {topic.contentType === 'pdf' && topic.contentUrl && (
                  <a className="btn" href={topic.contentUrl} target="_blank" rel="noreferrer">Open PDF</a>
                )}
                {topic.contentType === 'text' && <p style={{ whiteSpace: 'pre-wrap' }}>{topic.body}</p>}
                <button className="btn ghost" disabled title="Phase 2">Mark complete</button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
