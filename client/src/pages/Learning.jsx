import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
// `?url` emits the worker as its own asset and hands us a string — the 1.3 MB
// never enters the bundle, and is only fetched when a PDF is actually opened.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Markdown from '../components/Markdown.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import LineIcon from '../components/LineIcon.jsx';
import { CheckBadge, SubmissionCheckPanel } from '../components/SubmissionCheck.jsx';

// TEMPORARY test files, until mentors attach real ones. Both are real Menler
// documents on the public marketing host rather than localhost, so they keep
// working once this is deployed — and the deck HAS to be public regardless,
// since Microsoft's embed fetches the file itself and cannot see a local
// address. Delete both constants and the `||` fallbacks below once real files
// are attached to lessons.
const PLACEHOLDER_READING = 'https://menler.in/pdfs/Menler_AI_Kickstarter_Curriculum.pdf';
const PLACEHOLDER_NOTES = 'https://menler.in/project_decks/Account_Research_Agent.pptx';

// Learning. For students: Content + Assignments (submit) + Quizzes (take).
// For mentors/admins: just the course content to teach from — they create &
// grade assignments/quizzes under Programs → a batch, not here.
export default function Learning() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  // ?tab= lets search results (and shared links) open straight onto the right
  // tab — "assignments" hits from ⌘K would otherwise land on Content.
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = params.get('tab');
    return ['content', 'assignments', 'quizzes'].includes(t) ? t : 'content';
  });

  // …and keeps working when a result is opened while already on this page.
  const wantTab = params.get('tab');
  const wantTopic = params.get('topic');
  useEffect(() => {
    if (wantTab && ['content', 'assignments', 'quizzes'].includes(wantTab)) setTab(wantTab);
    else if (wantTopic) setTab('content');
  }, [wantTab, wantTopic]);

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
  const [review, setReview] = useState(null);
  const [showReview, setShowReview] = useState(false);
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

  // Fetched once, then toggled — the review never changes after an attempt.
  async function toggleReview() {
    if (review) { setShowReview((v) => !v); return; }
    setBusy(true);
    try {
      setReview(await api(`/quizzes/${quiz._id}/review`));
      setShowReview(true);
    } finally { setBusy(false); }
  }

  const pct = attempt && attempt.total ? Math.round((attempt.score / attempt.total) * 100) : null;

  return (
    <div className="panel">
      <div className="row">
        <strong>{quiz.title}</strong>
        <span className="badge">{quiz.type}</span>
        {attempt && <span className="badge badge-student">Scored {attempt.score}/{attempt.total}</span>}
      </div>
      {!attempt && !open && <button className="btn sm" onClick={() => setOpen(true)}>Take quiz</button>}
      {attempt && (
        <div className="quiz-review-bar">
          <div className="qr-score">
            <span className="qr-score-pct">{pct}%</span>
            <span className="muted">{attempt.score} of {attempt.total} correct</span>
          </div>
          <button className="btn sm ghost" onClick={toggleReview} disabled={busy}>
            {busy ? 'Loading…' : showReview ? 'Hide review' : 'Review answers'}
          </button>
        </div>
      )}
      {showReview && review && <QuizReview questions={review.questions} />}
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

// Post-attempt feedback: every question with the student's pick, the right
// answer, and the mentor's explanation. This is where the quiz actually teaches.
function QuizReview({ questions }) {
  return (
    <div className="quiz-review">
      {questions.map((q, qi) => (
        <div key={q._id} className={`qr-q ${q.isCorrect ? 'ok' : 'bad'}`}>
          <div className="qr-q-head">
            <span className={`qr-mark ${q.isCorrect ? 'ok' : 'bad'}`}>{q.isCorrect ? '✓' : '✗'}</span>
            <strong>{qi + 1}. {q.text}</strong>
          </div>

          <div className="qr-opts">
            {q.options.map((o, oi) => {
              const isCorrect = oi === q.correctIndex;
              const isMine = oi === q.myAnswer;
              return (
                <div key={oi} className={`qr-opt ${isCorrect ? 'correct' : isMine ? 'wrong' : ''}`}>
                  <span>{o}</span>
                  {isCorrect && <span className="qr-tag tag-correct">{isMine ? 'Your answer · correct' : 'Correct answer'}</span>}
                  {isMine && !isCorrect && <span className="qr-tag tag-wrong">Your answer</span>}
                </div>
              );
            })}
          </div>

          {q.myAnswer === null && <p className="muted qr-blank">You left this one blank.</p>}

          {q.explanation && (
            <div className="qr-why">
              <div className="qr-why-label">Why</div>
              <Markdown text={q.explanation} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Content() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  // The lesson you're on lives in the URL, so a lesson is a shareable link and
  // ⌘K can drop you straight into one instead of onto the page that holds it.
  const [params, setParams] = useSearchParams();
  const [programs, setPrograms] = useState([]);
  const [program, setProgram] = useState(null);
  const [topicId, setTopicId] = useState(null);
  const [open, setOpen] = useState({});
  const [completed, setCompleted] = useState(new Set());
  const [total, setTotal] = useState(0);
  const [cert, setCert] = useState(null);
  const [viewer, setViewer] = useState(null); // { label, subtitle, url }

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
  // Locate a topic anywhere in a program's tree, so a deep link can open the
  // right module + chapter as well as the right lesson.
  function locate(p, tid) {
    for (const m of p.modules || []) {
      for (const c of m.chapters || []) {
        for (const t of c.topics || []) if (String(t._id) === String(tid)) return { topic: t, modId: m._id, chapId: c._id };
      }
    }
    return null;
  }

  async function pick(id, preferTopicId) {
    const { program: p } = await api(`/programs/${id}`);
    setProgram(p); setCert(null);
    const target = preferTopicId ? locate(p, preferTopicId) : null;
    if (target) {
      setOpen({ [target.modId]: true, [target.chapId]: true });
      setTopicId(target.topic._id);
    } else {
      // Auto-open + select the very first lesson so the page is never empty.
      const firstMod = (p.modules || [])[0];
      const firstChap = firstMod?.chapters?.[0];
      const firstTopic = firstChap?.topics?.[0];
      setOpen(firstMod && firstChap ? { [firstMod._id]: true, [firstChap._id]: true } : {});
      setTopicId(firstTopic?._id || null);
    }
    loadProgress(id);
  }
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  function selectTopic(f) {
    setTopicId(f.topic._id);
    setOpen((o) => ({ ...o, [f.modId]: true, [f.chapId]: true }));
    // replace, not push — Prev/Next shouldn't fill the back button with lessons.
    if (program) setParams({ program: program._id, topic: String(f.topic._id) }, { replace: true });
  }

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
        // Honour a deep link (?program=&topic=) on first load; otherwise open
        // the first programme as before.
        const wantP = params.get('program');
        const start = (wantP && list.find((p) => p._id === wantP)) ? wantP : list[0]?._id;
        if (start) pick(start, params.get('topic'));
      })
      .catch(() => {});
  }, []);

  // A search result opened while already on this page only changes the URL —
  // react to that too, or ⌘K would appear to do nothing the second time.
  const urlProgram = params.get('program');
  const urlTopic = params.get('topic');
  useEffect(() => {
    if (!urlTopic || !program) return;
    if (String(urlTopic) === String(topicId)) return;
    if (urlProgram && urlProgram !== program._id) { pick(urlProgram, urlTopic); return; }
    const target = locate(program, urlTopic);
    if (target) { setTopicId(target.topic._id); setOpen((o) => ({ ...o, [target.modId]: true, [target.chapId]: true })); }
  }, [urlProgram, urlTopic]);

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
  const readingUrl = topic?.readingUrl || PLACEHOLDER_READING;
  const notesUrl = topic?.notesUrl || PLACEHOLDER_NOTES;

  return (
    <div className="learn">
      {/* Header: program picker + progress ring */}
      <div className="learn-top">
        <div className="learn-prog-pick">
          <span className="learn-eyebrow">Program</span>
          <select value={program?._id || ''} onChange={(e) => { if (e.target.value) { setParams({ program: e.target.value }, { replace: true }); pick(e.target.value); } }}>
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
                            {/* The dot carries state here exactly as it does on the Path. */}
                            <span className="cur-tick" />
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
                  <div className="lesson-head-top">
                    <div className="lesson-crumb">{current.mod}{current.chap && current.chap !== 'Lessons' ? ` · ${current.chap}` : ''}</div>
                  </div>
                  <h1 className="lesson-title">{topic.title}</h1>
                  {/* Same numbers the old chip read from — position in the
                      flattened lesson list, so it tracks as you move around. */}
                  <div className="lesson-position">Lesson {idx + 1} of {flat.length}</div>

                  {/* Three peers on one line. None is filled — the primary move
                      on this page is still "Mark complete" in the footer. */}
                  <div className="lesson-actions">
                    <button className="btn sm lesson-action" onClick={() => setViewer({ label: 'Reading Material', subtitle: topic.title, url: readingUrl })}>
                      <LessonIcon type="pdf" size={15} /> Reading Material
                    </button>
                    <button className="btn sm lesson-action" onClick={() => setViewer({ label: 'Teacher Notes', subtitle: topic.title, url: notesUrl })}>
                      <LineIcon name="slides" size={15} /> Teacher Notes
                    </button>
                    {topic.classLink ? (
                      <a className="btn sm lesson-action" href={topic.classLink} target="_blank" rel="noreferrer">
                        <LineIcon name="video" size={15} /> Join Class
                      </a>
                    ) : (
                      <button className="btn sm lesson-action" disabled title="Your mentor hasn't posted the class link for this lecture yet">
                        <LineIcon name="video" size={15} /> Not available yet
                      </button>
                    )}
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
                    <button className={`btn ${isDone ? 'ghost' : 'on-stage'}`} onClick={() => toggleComplete(topic._id)}>
                      {isDone ? 'Completed' : 'Mark complete'}
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
      {viewer && <FileViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

// A panel over the page — never a navigation, so closing it returns you to the
// exact scroll position you left. The file renders INSIDE the iframe: PDFs go
// straight to the browser's own viewer, Office formats through Microsoft's
// embed. "Open in new tab" is a small escape hatch for when an embed won't
// load, not the way you're meant to read anything.
function FileViewer({ label, subtitle, url, onClose }) {
  const ext = (url.split(/[?#]/)[0].split('.').pop() || '').toLowerCase();
  const isOffice = ['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx'].includes(ext);
  const isPdf = ext === 'pdf';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1)/i.test(url);
  const src = isOffice ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}` : url;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portalled to <body> on purpose. `.main` carries the page-enter animation,
  // and a filling transform/opacity animation makes the element a stacking
  // context — which would trap this overlay inside it, letting the topbar and
  // the dock paint over the reader no matter how high its z-index went.
  return createPortal(
    <div className="fv-overlay" onClick={onClose}>
      <div className="fv" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${label} — ${subtitle}`}>
        <div className="fv-head">
          <div className="fv-head-copy">
            <div className="fv-kicker">{label}</div>
            <div className="fv-title">{subtitle}</div>
          </div>
          {/* Deliberately absent for PDFs: opening one in a tab hands the
              student the browser's native viewer, download and print included,
              which is exactly what the custom reader exists to avoid. Office
              files keep it — the embed can fail and there's no other way in. */}
          {!isPdf && <a className="fv-escape" href={url} target="_blank" rel="noreferrer">Open in new tab</a>}
          <button className="fv-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {isPdf
          ? <PdfReader url={url} />
          : <iframe className="fv-frame" src={src} title={`${label} — ${subtitle}`} />}
        {isOffice && isLocal && (
          <div className="fv-note">
            This deck is on a local address, which Microsoft's viewer can't reach — put it on a
            public URL to preview it here, or use “Open in new tab”.
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Wrap every occurrence of `q` inside an already-rendered text layer in a
// <mark>. Works per text node, so a match split across two pdf.js spans (rare,
// but it happens mid-word) won't light up — the search index below still counts
// it, so navigation stays correct even when the highlight misses.
function highlightMatches(container, q) {
  const needle = q.toLowerCase();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const targets = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeValue && n.nodeValue.toLowerCase().includes(needle)) targets.push(n);
  }
  for (const node of targets) {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    const frag = document.createDocumentFragment();
    let i = 0;
    for (;;) {
      const at = lower.indexOf(needle, i);
      if (at === -1) break;
      if (at > i) frag.append(text.slice(i, at));
      const mark = document.createElement('mark');
      mark.className = 'pdfr-hit';
      mark.textContent = text.slice(at, at + q.length);
      frag.append(mark);
      i = at + q.length;
    }
    frag.append(text.slice(i));
    node.parentNode?.replaceChild(frag, node);
  }
}

// One page of the document. Mounted for every page in the PDF so the scrollbar
// tells the truth about length, but only PAINTED when it comes near the
// viewport — a 200-page deck would otherwise hold 200 canvases of bitmap.
// Leaving the neighbourhood frees the canvas again.
function PdfPage({ doc, lib, num, zoom, term, base, root, onCurrent, bind }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const linkRef = useRef(null);
  const taskRef = useRef(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState(null); // true page size at scale 1, once known

  // Hand the element up so the toolbar can scroll to this page.
  useEffect(() => { bind(num, hostRef.current); return () => bind(num, null); }, [num, bind]);

  // Paint when close to the viewport; a generous margin means pages are ready
  // before you reach them rather than flashing in under your eyes.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root, rootMargin: '150% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  // Whichever page is crossing the middle of the viewport is "the page you're
  // on" — that's what the toolbar counter reports.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) onCurrent(num); },
      { root, rootMargin: '-45% 0px -45% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root, num, onCurrent]);

  useEffect(() => {
    if (!near) {
      // Hand the bitmap back. Sizing lives in React state, so the placeholder
      // keeps its height and the scrollbar doesn't jump.
      const c = canvasRef.current;
      if (c) { c.width = 0; c.height = 0; }
      textRef.current?.replaceChildren();
      linkRef.current?.replaceChildren();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
      const p = await doc.getPage(num);
      if (cancelled || !canvasRef.current) return;

      // Two viewports: CSS scale for the DOM layers, times device pixel ratio
      // for the canvas — otherwise glyphs are soft on retina screens.
      const viewport = p.getViewport({ scale: zoom });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvasVp = p.getViewport({ scale: zoom * dpr });

      const unit = p.getViewport({ scale: 1 });
      if (!size || size.w !== unit.width) setSize({ w: unit.width, h: unit.height });

      const host = hostRef.current;
      // pdf.js's text-layer CSS sizes every span off these two properties.
      host.style.setProperty('--scale-factor', String(zoom));
      host.style.setProperty('--total-scale-factor', String(zoom));

      const canvas = canvasRef.current;
      taskRef.current?.cancel();
      canvas.width = Math.floor(canvasVp.width);
      canvas.height = Math.floor(canvasVp.height);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const task = p.render({ canvasContext: canvas.getContext('2d'), viewport: canvasVp });
      taskRef.current = task;
      try { await task.promise; } catch { return; } // superseded by a newer render
      if (cancelled || !textRef.current) return;

      textRef.current.replaceChildren();
      const layer = new lib.TextLayer({ textContentSource: p.streamTextContent(), container: textRef.current, viewport });
      await layer.render();
      if (cancelled) return;
      if (term.length >= 2) highlightMatches(textRef.current, term);

      // Links are our own positioned overlays rather than pdf.js's
      // AnnotationLayer, which would drag in the whole viewer stack just to
      // resolve a destination.
      const annots = await p.getAnnotations({ intent: 'display' });
      if (cancelled || !linkRef.current) return;
      const box = linkRef.current;
      box.replaceChildren();
      for (const a of annots) {
        if (a.subtype !== 'Link' || (!a.url && !a.dest)) continue;
        const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
        const el = document.createElement(a.url ? 'a' : 'button');
        el.className = 'pdfr-link';
        el.style.left = `${Math.min(x1, x2)}px`;
        el.style.top = `${Math.min(y1, y2)}px`;
        el.style.width = `${Math.abs(x2 - x1)}px`;
        el.style.height = `${Math.abs(y2 - y1)}px`;
        if (a.url) {
          el.href = a.url;
          el.target = '_blank';
          el.rel = 'noreferrer noopener';
          el.title = a.url;
        } else {
          el.type = 'button';
          el.title = 'Go to section';
          el.addEventListener('click', async () => {
            try {
              const d = typeof a.dest === 'string' ? await doc.getDestination(a.dest) : a.dest;
              if (d) window.dispatchEvent(new CustomEvent('pdfr:goto', { detail: (await doc.getPageIndex(d[0])) + 1 }));
            } catch { /* broken internal link — stay put */ }
          });
        }
        box.append(el);
      }
      } catch {
        // The document was closed (or destroyed) while this page was still
        // painting. Nothing to recover — just don't let the rejection escape.
      }
    })();
    return () => {
      cancelled = true;
      try { taskRef.current?.cancel(); } catch { /* already finished */ }
    };
  }, [near, zoom, term, num, doc, lib]);

  const dims = size || base;
  return (
    <div
      ref={hostRef}
      className="pdfr-page"
      data-page={num}
      style={{ width: Math.floor(dims.w * zoom), height: Math.floor(dims.h * zoom) }}
    >
      <canvas ref={canvasRef} className="pdfr-canvas" />
      <div ref={textRef} className="textLayer" />
      <div ref={linkRef} className="pdfr-linklayer" />
      <span className="pdfr-folio">{num}</span>
    </div>
  );
}

// A PDF reader we own, rather than the browser's. pdf.js hands us pages; we
// paint them to canvases, lay pdf.js's real text layer over the top, and draw
// our own chrome around the whole thing. Owning the chrome is the point: no
// download, no print, no Save As.
//
// Pages scroll continuously, the way a document wants to be read — the toolbar
// counter follows the scroll rather than driving it.
//
// The text layer is transparent DOM text positioned exactly over the painted
// glyphs. That is what makes selection, copy, find and links work at all — the
// canvas alone is just pixels.
//
// The library is imported lazily, so a student who never opens a document never
// pays for it.
function PdfReader({ url }) {
  const stageRef = useRef(null);
  const libRef = useRef(null);
  const docRef = useRef(null);
  const els = useRef(new Map());
  const textCache = useRef(new Map());
  const currentRef = useRef(1);

  const [ready, setReady] = useState(false);
  const [pages, setPages] = useState(0);
  const [base, setBase] = useState({ w: 612, h: 792 }); // US Letter, until page 1 says otherwise
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [pageBox, setPageBox] = useState('1');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');   // debounced — drives search AND repaint
  const [hits, setHits] = useState([]);   // page number per match, in reading order
  const [hitIdx, setHitIdx] = useState(0);

  // Open the document once per URL.
  useEffect(() => {
    let dead = false;
    setError(''); setReady(false); setPages(0); setCurrent(1); setPageBox('1');
    setQuery(''); setTerm(''); setHits([]);
    textCache.current = new Map();
    els.current = new Map();
    (async () => {
      try {
        const lib = await import('pdfjs-dist/build/pdf.min.mjs');
        lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const doc = await lib.getDocument({ url, isEvalSupported: false }).promise;
        if (dead) { doc.destroy(); return; }
        const first = await doc.getPage(1);
        const unit = first.getViewport({ scale: 1 });
        if (dead) { doc.destroy(); return; }
        libRef.current = lib;
        docRef.current = doc;
        setBase({ w: unit.width, h: unit.height });
        setPages(doc.numPages);
        // Open at the width of the panel — the default a reader expects,
        // rather than an arbitrary percentage.
        const room = (stageRef.current?.clientWidth || unit.width) - 56;
        setZoom(Math.min(2, Math.max(0.5, +(room / unit.width).toFixed(2))));
        setReady(true);
      } catch {
        // Usually a missing CORS header: unlike an iframe, pdf.js fetches the
        // bytes itself and is bound by same-origin rules.
        if (!dead) setError("This document couldn't be loaded. It may have moved, or its host may not allow it to be read here.");
      }
    })();
    // Closing the panel unmounts this. destroy() can throw or reject while a
    // page is mid-render, and an exception escaping a cleanup takes the whole
    // React tree down with it — which showed up as a blank screen on ✕.
    return () => {
      dead = true;
      const d = docRef.current;
      docRef.current = null;
      libRef.current = null;
      try { Promise.resolve(d?.destroy()).catch(() => {}); } catch { /* already gone */ }
    };
  }, [url]);

  const bind = useMemo(() => (n, el) => { if (el) els.current.set(n, el); else els.current.delete(n); }, []);
  const scrollToPage = useMemo(() => (n, smooth = true) => {
    const el = els.current.get(Math.min(Math.max(n, 1), pages || 1));
    el?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }, [pages]);

  const onCurrent = useMemo(() => (n) => {
    currentRef.current = n;
    setCurrent(n);
    setPageBox(String(n));
  }, []);

  // Internal links live in plain DOM listeners inside PdfPage, so they shout
  // rather than call up through props.
  useEffect(() => {
    const go = (e) => scrollToPage(e.detail);
    window.addEventListener('pdfr:goto', go);
    return () => window.removeEventListener('pdfr:goto', go);
  }, [scrollToPage]);

  // Zooming should leave you looking at the same page, not fling you to the top.
  useEffect(() => {
    if (ready) scrollToPage(currentRef.current, false);
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce typing so we neither repaint nor re-scan on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Build the match index across the whole document. Per-page text is cached,
  // so a second search in a long PDF costs nothing extra.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !pages || term.length < 2) { setHits([]); setHitIdx(0); return; }
    let dead = false;
    (async () => {
      try {
      const found = [];
      const needle = term.toLowerCase();
      for (let n = 1; n <= pages; n++) {
        if (dead) return;
        let text = textCache.current.get(n);
        if (text == null) {
          const p = await doc.getPage(n);
          const tc = await p.getTextContent();
          text = tc.items.map((it) => it.str).join(' ');
          textCache.current.set(n, text);
        }
        const hay = text.toLowerCase();
        let at = hay.indexOf(needle);
        while (at !== -1) { found.push(n); at = hay.indexOf(needle, at + needle.length); }
      }
      if (dead) return;
      setHits(found);
      setHitIdx(0);
      if (found.length) scrollToPage(found[0]);
      } catch { /* document closed mid-scan */ }
    })();
    return () => { dead = true; };
  }, [term, pages, scrollToPage]);

  const jumpHit = (n) => {
    if (!hits.length) return;
    const i = (hitIdx + n + hits.length) % hits.length;
    setHitIdx(i);
    scrollToPage(hits[i]);
  };
  const fitWidth = () => {
    const room = (stageRef.current?.clientWidth || base.w) - 56;
    setZoom(Math.min(3, Math.max(0.5, +(room / base.w).toFixed(2))));
  };
  const commitPageBox = () => {
    const n = parseInt(pageBox, 10);
    if (Number.isFinite(n)) scrollToPage(n);
    else setPageBox(String(current));
  };

  // Up/Down scroll the stage natively. Left/Right jump a whole page, which
  // vertical scrolling can't express — unless you're typing in the find box.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); scrollToPage(currentRef.current + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollToPage(currentRef.current - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scrollToPage]);

  if (error) return <div className="pdfr-state">{error}</div>;

  return (
    <>
      <div className="pdfr-bar">
        <div className="pdfr-group">
          <input
            className="pdfr-pagebox"
            value={pageBox}
            onChange={(e) => setPageBox(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            onBlur={commitPageBox}
            aria-label="Page number"
            disabled={!ready}
          />
          <span className="pdfr-count">of {pages || '–'}</span>
        </div>

        <div className="pdfr-group pdfr-find">
          <input
            className="pdfr-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); jumpHit(e.shiftKey ? -1 : 1); } }}
            placeholder="Find in document…"
            aria-label="Find in document"
            disabled={!ready}
          />
          {term.length >= 2 && (
            <>
              <span className="pdfr-count">{hits.length ? `${hitIdx + 1} / ${hits.length}` : 'None'}</span>
              <button className="pdfr-btn" onClick={() => jumpHit(-1)} disabled={!hits.length} aria-label="Previous match">‹</button>
              <button className="pdfr-btn" onClick={() => jumpHit(1)} disabled={!hits.length} aria-label="Next match">›</button>
            </>
          )}
        </div>

        <div className="pdfr-group">
          <button className="pdfr-btn" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} disabled={!ready || zoom <= 0.5} aria-label="Zoom out">−</button>
          <span className="pdfr-count pdfr-zoom">{Math.round(zoom * 100)}%</span>
          <button className="pdfr-btn" onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))} disabled={!ready || zoom >= 3} aria-label="Zoom in">+</button>
          <button className="pdfr-btn pdfr-fit" onClick={fitWidth} disabled={!ready} title="Fit width" aria-label="Fit width">⤢</button>
        </div>
      </div>

      <div className="pdfr-stage" ref={stageRef} tabIndex={0}>
        {!ready ? (
          <div className="pdfr-state">Loading document…</div>
        ) : (
          Array.from({ length: pages }, (_, i) => (
            <PdfPage
              key={i + 1}
              num={i + 1}
              doc={docRef.current}
              lib={libRef.current}
              zoom={zoom}
              term={term}
              base={base}
              root={stageRef.current}
              onCurrent={onCurrent}
              bind={bind}
            />
          ))
        )}
      </div>
    </>
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
          <div className="cert-brand">menler</div>
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

// Mirrors the mentor-side DRIVE_TYPES list, in student-facing wording.
const REQUIRED_LABELS = {
  video: 'a video',
  image: 'a photo/screenshot',
  doc: 'a document (PDF, Word or text file)',
  slides: 'a slide deck (PPT)',
  html: 'an HTML file',
};

function AssignmentCard({ a, onChange }) {
  const { user } = useOutletContext();
  const sub = a.mySubmission;
  const [driveLink, setDriveLink] = useState(sub?.driveLink || '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Editing re-runs verification server-side, so stale error text can
      // never survive a changed link.
      if (sub) await api(`/submissions/${sub._id}`, { method: 'PATCH', body: { driveLink } });
      else await api('/submissions', { method: 'POST', body: { assignmentId: a._id, driveLink } });
      setEditing(false);
      onChange();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!sub || !window.confirm('Delete this submission? This can’t be undone.')) return;
    setBusy(true);
    setError('');
    try { await api(`/submissions/${sub._id}`, { method: 'DELETE' }); onChange(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const fmt = (d) => new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const overdue = a.dueDate && new Date(a.dueDate) < new Date();
  const notOpenYet = a.startDate && new Date(a.startDate) > new Date();
  const due = a.dueDate && fmt(a.dueDate);
  const start = a.startDate && fmt(a.startDate);
  const showForm = (!sub || editing) && !notOpenYet;
  // Mirrors the server's rules — the API is still the authority, this just
  // avoids offering an action that would be rejected.
  const editable = !sub?.locked && !overdue && !notOpenYet;
  const required = (a.requiredDriveTypes || []).map((t) => REQUIRED_LABELS[t] || t);

  return (
    <div className="panel assign-card">
      <div className="assign-head">
        <div>
          <div className="assign-title"><strong>{a.title}</strong><span className={`badge ${a.type === 'project' ? 'badge-mentor' : ''}`}>{a.type}</span></div>
          {notOpenYet && <div className="assign-due"><LineIcon name="clock" size={13} /> Opens {start}</div>}
          {a.dueDate && <div className={`assign-due ${overdue && !sub ? 'overdue' : ''}`}><LineIcon name="clock" size={13} /> Due {due}{overdue ? ' · overdue' : ''}</div>}
        </div>
        {sub && <span className={`badge ${sub.status === 'graded' ? 'badge-student' : ''}`}>{sub.status}</span>}
      </div>

      {a.description && <div className="assign-desc"><Markdown text={a.description} /></div>}

      {/* Current verification state — visible without opening notifications. */}
      {sub && !editing && (
        <SubmissionCheckPanel submission={{ ...sub, driveLink: sub.driveLink || sub.url }} audience="student" />
      )}

      {sub?.status === 'graded' && (
        <div className="graded">
          <div className="tile-value">{sub.score != null ? `${sub.score}/10` : '—'}</div>
          <div><strong>Score</strong>{sub.feedback && <p className="muted">“{sub.feedback}”</p>}</div>
        </div>
      )}

      {error && <p className="sub-check-error">{error}</p>}

      {notOpenYet ? (
        <p className="muted">Submissions for this {a.type} open on {start}.</p>
      ) : showForm ? (
        <form className="sub-form" onSubmit={submit}>
          {/* On an edit after a failed check, lead with what needs fixing. */}
          {editing && (sub?.checkStatus === 'NEEDS_FIXES' || sub?.checkStatus === 'CHECK_FAILED') && sub?.errorDetail && (
            <div className="sub-form-alert">
              <CheckBadge status={sub.checkStatus} audience="student" />
              <p>{sub.errorDetail}</p>
            </div>
          )}

          <div className="sub-form-grid">
            <div className="sub-field">
              <span className="sub-field-label">Student</span>
              <span className="sub-field-value">{user?.full_name || user?.fullName || user?.email}</span>
            </div>
            <div className="sub-field">
              <span className="sub-field-label">{a.type === 'project' ? 'Project' : 'Assignment'}</span>
              <span className="sub-field-value">{a.title}</span>
            </div>
            <div className="sub-field">
              <span className="sub-field-label">Opens</span>
              <span className="sub-field-value">{start || 'Open now'}</span>
            </div>
            <div className="sub-field">
              <span className="sub-field-label">Last date to submit</span>
              <span className={`sub-field-value ${overdue ? 'is-overdue' : ''}`}>{due || 'No deadline'}</span>
            </div>
          </div>

          {/* What the automated check will look for — shown so the student
              isn't guessing at what the folder must contain. */}
          {required.length > 0 && (
            <p className="muted sub-form-hint">
              <strong>Your folder must contain:</strong> {required.join(', ')}.
            </p>
          )}

          <label className="sub-field-label" htmlFor={`drive-${a._id}`}>Google Drive folder link</label>
          <div className="assign-submit">
            <input
              id={`drive-${a._id}`}
              placeholder="https://drive.google.com/drive/folders/…"
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              required
            />
            <button className="btn sm" disabled={busy}>{busy ? 'Checking…' : (sub ? 'Save' : 'Submit')}</button>
            {sub && <button type="button" className="btn sm ghost" onClick={() => { setEditing(false); setError(''); setDriveLink(sub.driveLink || ''); }}>Cancel</button>}
          </div>
          <p className="muted sub-form-hint">Share the folder as “Anyone with the link can view”, and include your video, screenshots, and write-up.</p>
        </form>
      ) : sub?.locked ? (
        <p className="muted">This submission has been reviewed and is locked. Ask your mentor to unlock it if you need to change it.</p>
      ) : overdue ? (
        <p className="muted">The deadline has passed, so this submission can no longer be changed.</p>
      ) : (
        <div className="inline-form">
          <button type="button" className="btn sm ghost" onClick={() => setEditing(true)} disabled={!editable}>Edit</button>
          <button type="button" className="btn sm ghost" onClick={remove} disabled={busy || !editable}>Delete</button>
        </div>
      )}
    </div>
  );
}
