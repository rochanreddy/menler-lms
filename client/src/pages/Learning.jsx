import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';

// Learning. For students: Content + Assignments (submit) + Quizzes (take).
// For mentors/admins: just the course content to teach from — they create &
// grade assignments/quizzes under Programs → a batch, not here.
export default function Learning() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  const [tab, setTab] = useState('content');

  if (!isStudent) {
    return (
      <div>
        <h1>Learning</h1>
        <p className="muted">The course content your students see — teach from this. Create &amp; grade assignments and quizzes under <b>Programs → your batch</b>.</p>
        <Content />
      </div>
    );
  }

  return (
    <div>
      <h1>Learning</h1>
      <div className="tabs">
        <button className={`tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>Content</button>
        <button className={`tab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>Assignments & Projects</button>
        <button className={`tab ${tab === 'quizzes' ? 'active' : ''}`} onClick={() => setTab('quizzes')}>Quizzes</button>
      </div>
      {tab === 'content' && <Content />}
      {tab === 'assignments' && <Assignments />}
      {tab === 'quizzes' && <Quizzes />}
    </div>
  );
}

function Quizzes() {
  const [items, setItems] = useState([]);
  const load = () => api('/quizzes?scope=mine').then((d) => setItems(d.quizzes || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  if (items.length === 0) return <p className="muted">No quizzes yet. Your mentor will post them here.</p>;
  return <div className="list">{items.map((q) => <QuizCard key={q._id} quiz={q} onDone={load} />)}</div>;
}

function QuizCard({ quiz, onDone }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const attempt = quiz.myAttempt;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const ordered = quiz.questions.map((_, i) => (answers[i] ?? -1));
      await api(`/quizzes/${quiz._id}/attempt`, { method: 'POST', body: { answers: ordered } });
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="row">
        <strong>{quiz.title}</strong>
        <span className="badge">{quiz.type}</span>
        {attempt && <span className="badge badge-student">Scored {attempt.score}/{attempt.total}</span>}
      </div>
      {!attempt && !open && <button className="btn sm" onClick={() => setOpen(true)}>Take quiz</button>}
      {!attempt && open && (
        <form onSubmit={submit}>
          {quiz.questions.map((q, qi) => (
            <div key={q._id} className="quiz-take-q">
              <p><strong>{qi + 1}. {q.text}</strong></p>
              {q.options.map((o, oi) => (
                <label key={oi} className="quiz-opt">
                  <input type="radio" name={`q-${quiz._id}-${qi}`} checked={answers[qi] === oi} onChange={() => setAnswers((a) => ({ ...a, [qi]: oi }))} required />
                  {o}
                </label>
              ))}
            </div>
          ))}
          <button className="btn sm" disabled={busy}>{busy ? 'Submitting…' : 'Submit answers'}</button>
        </form>
      )}
    </div>
  );
}

function Content() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  const [programs, setPrograms] = useState([]);
  const [program, setProgram] = useState(null);
  const [topic, setTopic] = useState(null);
  const [open, setOpen] = useState({});
  const [completed, setCompleted] = useState(new Set());
  const [total, setTotal] = useState(0);
  const [cert, setCert] = useState(null);

  const loadProgress = (programId) => {
    if (!isStudent || !programId) return;
    api(`/progress/me?programId=${programId}`).then((d) => { setCompleted(new Set(d.completedTopics)); setTotal(d.total); }).catch(() => {});
  };
  async function pick(id) { const { program: p } = await api(`/programs/${id}`); setProgram(p); setTopic(null); setCert(null); loadProgress(id); }
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  useEffect(() => {
    // Students only see the program(s) of the batches they're enrolled in.
    Promise.all([api('/programs'), isStudent ? api('/batches') : Promise.resolve({ batches: null })])
      .then(([pd, bd]) => {
        let list = pd.programs || [];
        if (bd.batches) {
          const mine = new Set(bd.batches.map((b) => b.programId).filter(Boolean));
          list = list.filter((p) => mine.has(p._id));
        }
        setPrograms(list);
        if (list.length === 1) pick(list[0]._id);
      })
      .catch(() => {});
  }, []);

  async function toggleComplete(topicId) {
    const { completedTopics } = await api('/progress/toggle', { method: 'POST', body: { programId: program._id, topicId } });
    setCompleted(new Set(completedTopics));
  }
  async function viewCertificate() {
    const c = await api(`/progress/certificate?programId=${program._id}`);
    if (c.eligible) setCert(c);
  }

  const pct = total ? Math.round((Math.min(completed.size, total) / total) * 100) : 0;

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

      {program && isStudent && total > 0 && (
        <div className="progress-head">
          <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
          <span className="progress-pct">{pct}% · {Math.min(completed.size, total)}/{total} lessons</span>
          {pct === 100 && <button className="btn sm" onClick={viewCertificate}>🎓 View certificate</button>}
        </div>
      )}

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
                      <div key={t._id} className={`tree-topic ${topic?._id === t._id ? 'active' : ''} ${completed.has(t._id) ? 'done' : ''}`} onClick={() => setTopic(t)}>
                        {completed.has(t._id) && <span className="topic-check">✓</span>}{t.title}
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
                {topic.contentType === 'video' && topic.contentUrl && <video src={topic.contentUrl} controls style={{ width: '100%', borderRadius: 8 }} />}
                {topic.contentType === 'pdf' && topic.contentUrl && <a className="btn" href={topic.contentUrl} target="_blank" rel="noreferrer">Open PDF</a>}
                {topic.contentType === 'text' && <p style={{ whiteSpace: 'pre-wrap' }}>{topic.body}</p>}
                {isStudent && (
                  <button className={`btn ${completed.has(topic._id) ? 'ghost' : ''}`} style={{ marginTop: 14 }} onClick={() => toggleComplete(topic._id)}>
                    {completed.has(topic._id) ? '✓ Completed — mark as not done' : 'Mark complete'}
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {cert && <CertificateModal cert={cert} onClose={() => setCert(null)} />}
    </div>
  );
}

function CertificateModal({ cert, onClose }) {
  return (
    <div className="cert-overlay" onClick={onClose}>
      <div className="cert" onClick={(e) => e.stopPropagation()}>
        <div className="cert-inner">
          <div className="cert-brand">🎓 Menler</div>
          <div className="cert-kicker">Certificate of Completion</div>
          <div className="cert-name">{cert.name}</div>
          <p className="cert-body">has successfully completed</p>
          <div className="cert-program">{cert.program}</div>
          <div className="cert-meta">
            <span>Issued {new Date(cert.issuedAt).toLocaleDateString()}</span>
            <span>ID {cert.certId}</span>
          </div>
        </div>
        <div className="cert-actions">
          <button className="btn" onClick={() => window.print()}>Download / Print</button>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
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
