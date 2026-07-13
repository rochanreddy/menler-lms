import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import Markdown from '../components/Markdown.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import LineIcon from '../components/LineIcon.jsx';

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
  const [topicId, setTopicId] = useState(null);
  const [open, setOpen] = useState({});
  const [completed, setCompleted] = useState(new Set());
  const [total, setTotal] = useState(0);
  const [cert, setCert] = useState(null);

  // Flatten the tree into an ordered lesson list for counting + prev/next.
  const flat = useMemo(() => {
    const arr = [];
    (program?.modules || []).forEach((m) => (m.chapters || []).forEach((c) => (c.topics || []).forEach((t) => arr.push({ topic: t, modId: m._id, chapId: c._id, mod: m.title, chap: c.title }))));
    return arr;
  }, [program]);
  const idx = flat.findIndex((f) => f.topic._id === topicId);
  const current = idx >= 0 ? flat[idx] : null;
  const topic = current?.topic || null;

  const loadProgress = (programId) => {
    if (!isStudent || !programId) return;
    api(`/progress/me?programId=${programId}`).then((d) => { setCompleted(new Set(d.completedTopics)); setTotal(d.total); }).catch(() => {});
  };
  async function pick(id) {
    const { program: p } = await api(`/programs/${id}`);
    setProgram(p); setCert(null);
    // Auto-open + select the very first lesson so the page is never empty.
    const firstMod = (p.modules || [])[0];
    const firstChap = firstMod?.chapters?.[0];
    const firstTopic = firstChap?.topics?.[0];
    setOpen(firstMod && firstChap ? { [firstMod._id]: true, [firstChap._id]: true } : {});
    setTopicId(firstTopic?._id || null);
    loadProgress(id);
  }
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  function selectTopic(f) { setTopicId(f.topic._id); setOpen((o) => ({ ...o, [f.modId]: true, [f.chapId]: true })); }

  useEffect(() => {
    // Students only see the program(s) of the batches they're enrolled in.
    Promise.all([api('/programs'), isStudent ? api('/batches') : Promise.resolve({ batches: null })])
      .then(([pd, bd]) => {
        let list = pd.programs || [];
        if (bd.batches) {
          // Students see only published programs of the batches they're enrolled in.
          const mine = new Set(bd.batches.map((b) => b.programId).filter(Boolean));
          list = list.filter((p) => mine.has(p._id) && p.published);
        }
        setPrograms(list);
        if (list.length >= 1) pick(list[0]._id);
      })
      .catch(() => {});
  }, []);

  async function toggleComplete(tid) {
    const { completedTopics } = await api('/progress/toggle', { method: 'POST', body: { programId: program._id, topicId: tid } });
    setCompleted(new Set(completedTopics));
  }
  async function viewCertificate() {
    const c = await api(`/progress/certificate?programId=${program._id}`);
    if (c.eligible) setCert(c);
  }

  const done = Math.min(completed.size, total);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isDone = topic && completed.has(topic._id);

  return (
    <div className="learn">
      {/* Header: program picker + progress ring */}
      <div className="learn-top">
        <div className="learn-prog-pick">
          <span className="learn-eyebrow">Program</span>
          <select value={program?._id || ''} onChange={(e) => e.target.value && pick(e.target.value)}>
            <option value="">Select a program…</option>
            {programs.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
          </select>
        </div>
        {program && isStudent && total > 0 && (
          <div className="learn-progress">
            <Ring pct={pct} />
            <div>
              <div className="learn-progress-pct">{pct}% complete</div>
              <div className="muted">{done} of {total} lessons</div>
            </div>
            {pct === 100 && <button className="btn sm" onClick={viewCertificate}>🎓 Certificate</button>}
          </div>
        )}
      </div>

      {!program ? (
        <div className="panel empty-state"><p className="muted">Choose a program above to start learning.</p></div>
      ) : flat.length === 0 ? (
        <div className="panel empty-state"><p className="muted">No lessons published yet.{!isStudent ? ' Add curriculum in Programs → Manage curriculum.' : ' Check back soon.'}</p></div>
      ) : (
        <div className="learn-grid">
          {/* Curriculum sidebar */}
          <aside className="curriculum">
            {(program.modules || []).map((m, mi) => {
              const mTopics = (m.chapters || []).flatMap((c) => c.topics || []);
              const mDone = mTopics.filter((t) => completed.has(t._id)).length;
              return (
                <div key={m._id} className="cur-mod">
                  <button className="cur-mod-head" onClick={() => toggle(m._id)}>
                    <span className="cur-mod-idx">{String(mi + 1).padStart(2, '0')}</span>
                    <span className="cur-mod-title">{m.title}</span>
                    {isStudent && mTopics.length > 0 && <span className="cur-mod-count">{mDone}/{mTopics.length}</span>}
                    <span className={`cur-caret ${open[m._id] ? 'up' : ''}`}>⌄</span>
                  </button>
                  {open[m._id] && (m.chapters || []).map((c) => (
                    <div key={c._id} className="cur-chap">
                      {(m.chapters.length > 1 || c.title !== 'Lessons') && <div className="cur-chap-title">{c.title}</div>}
                      {(c.topics || []).map((t) => {
                        const active = t._id === topicId;
                        const tdone = completed.has(t._id);
                        return (
                          <button key={t._id} className={`cur-topic ${active ? 'active' : ''} ${tdone ? 'done' : ''}`} onClick={() => selectTopic({ topic: t, modId: m._id, chapId: c._id })}>
                            <span className="cur-tick">{tdone ? '✓' : <LessonIcon type={t.contentType} size={12} />}</span>
                            <span className="cur-topic-title">{t.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </aside>

          {/* Lesson viewer */}
          <section className="lesson">
            {topic && (
              <>
                <div className="lesson-head">
                  <div className="lesson-crumb">{current.mod}{current.chap && current.chap !== 'Lessons' ? ` · ${current.chap}` : ''}</div>
                  <h1 className="lesson-title">{topic.title}</h1>
                  <div className="lesson-meta">
                    <span className="lesson-chip"><LessonIcon type={topic.contentType} size={13} /> {topic.contentType || 'text'}</span>
                    {isStudent && <span className={`lesson-chip ${isDone ? 'chip-done' : ''}`}>{isDone ? '✓ Completed' : 'Lesson ' + (idx + 1) + ' of ' + flat.length}</span>}
                  </div>
                </div>

                <div className="lesson-body">
                  {topic.contentType === 'video' && topic.contentUrl && <video src={topic.contentUrl} controls className="lesson-video" />}
                  {topic.contentType === 'pdf' && topic.contentUrl && <a className="btn" href={topic.contentUrl} target="_blank" rel="noreferrer">📄 Open PDF</a>}
                  {topic.body ? <Markdown text={topic.body} /> : (topic.contentType === 'text' && <p className="muted">No content for this lesson yet.</p>)}
                </div>

                <div className="lesson-foot">
                  <button className="btn ghost sm" disabled={idx <= 0} onClick={() => flat[idx - 1] && selectTopic(flat[idx - 1])}>← Previous</button>
                  {isStudent && (
                    <button className={`btn ${isDone ? 'ghost' : ''}`} onClick={() => toggleComplete(topic._id)}>
                      {isDone ? '✓ Completed' : 'Mark complete'}
                    </button>
                  )}
                  <button className="btn ghost sm" disabled={idx >= flat.length - 1} onClick={() => flat[idx + 1] && selectTopic(flat[idx + 1])}>Next →</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {cert && <CertificateModal cert={cert} onClose={() => setCert(null)} />}
    </div>
  );
}

// Circular progress indicator.
function Ring({ pct }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg className="ring" width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} className="ring-bg" />
      <circle cx="26" cy="26" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" className="ring-text">{pct}%</text>
    </svg>
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

  const overdue = a.dueDate && !sub && new Date(a.dueDate) < new Date();
  const due = a.dueDate && new Date(a.dueDate).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="panel assign-card">
      <div className="assign-head">
        <div>
          <div className="assign-title"><strong>{a.title}</strong><span className={`badge ${a.type === 'project' ? 'badge-mentor' : ''}`}>{a.type}</span></div>
          {a.dueDate && <div className={`assign-due ${overdue ? 'overdue' : ''}`}><LineIcon name="clock" size={13} /> Due {due}{overdue ? ' · overdue' : ''}</div>}
        </div>
        {sub && <span className={`badge ${sub.status === 'graded' ? 'badge-student' : ''}`}>{sub.status}</span>}
      </div>

      {a.description && <div className="assign-desc"><Markdown text={a.description} /></div>}

      {sub?.status === 'graded' ? (
        <div className="graded">
          <div className="tile-value">{sub.score ?? '—'}</div>
          <div><strong>Score</strong>{sub.feedback && <p className="muted">“{sub.feedback}”</p>}</div>
        </div>
      ) : (
        <form className="assign-submit" onSubmit={submit}>
          <input placeholder="Paste your submission link (GitHub, Drive, Docs…)" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <button className="btn sm" disabled={busy}>{busy ? 'Submitting…' : (sub ? 'Re-submit' : 'Submit')}</button>
        </form>
      )}
    </div>
  );
}
