import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api, getLessonVideos, getLessonVideoOtp } from '../api.js';
import FileViewer from './FileViewer.jsx';
import Markdown from './Markdown.jsx';
import LessonIcon from './LessonIcon.jsx';
import LineIcon from './LineIcon.jsx';
import Empty, { Loading } from './Empty.jsx';
import VdoCipherPlayer from './VdoCipherPlayer.jsx';
import Ring from './Ring.jsx';
import useMediaQuery, { MOBILE } from '../useMediaQuery.js';

// The Classroom: where a lesson is actually read. Learning's Content tab —
// sized to fill whatever the viewport has left under the page title.
//
// Two panes, sized to the viewport so the page never scrolls:
//   · the READER on the left — the lesson, on the dark stage. Title pinned
//     at the top, Prev / Mark complete / Next pinned at the bottom, a hairline
//     under the title that fills as you read.
//   · the RAIL on the right — the course. A progress ring, then the modules
//     as an accordion where exactly one is open, so every module is always on
//     screen and only the open one's lessons scroll. Collapses to a strip of
//     module badges for focus mode.
// On a phone the rail becomes a bottom sheet and the reader takes the screen.

const RAIL_KEY = 'lms:classroom-rail';

export default function Classroom() {
  const { user } = useOutletContext();
  const isStudent = user.role === 'student';
  // The lesson you're on lives in the URL, so a lesson is a shareable link and
  // ⌘K can drop you straight into one instead of onto the page that holds it.
  const [params, setParams] = useSearchParams();
  const [programs, setPrograms] = useState([]);
  const [program, setProgram] = useState(null);
  const [topicId, setTopicId] = useState(null);
  // The accordion: the one module whose lessons are showing.
  const [openMod, setOpenMod] = useState(null);
  const [completed, setCompleted] = useState(new Set());
  const [total, setTotal] = useState(0);
  const [cert, setCert] = useState(null);
  const [viewer, setViewer] = useState(null); // { label, subtitle, url }
  // Covers the programme list AND the pick() detail fetch that follows it —
  // the classroom isn't on screen until both have landed.
  const [loading, setLoading] = useState(true);
  // Lesson videos are attached per BATCH, not on the shared curriculum topic
  // (see server/models/BatchLessonVideo.js), so what plays here depends on
  // which batch the viewer is in. The server only ever returns rows for
  // batches this user belongs to, so nothing has to be filtered client-side.
  const [lessonVideos, setLessonVideos] = useState([]);

  // Rail visibility. On a laptop "min" folds it to a strip of module badges
  // (remembered); on a phone it's a sheet, never remembered.
  const isMobile = useMediaQuery(MOBILE);
  const [railMin, setRailMin] = useState(() => { try { return localStorage.getItem(RAIL_KEY) === 'min'; } catch { return false; } });
  const [sheet, setSheet] = useState(false);
  const setMin = (v) => { setRailMin(v); try { localStorage.setItem(RAIL_KEY, v ? 'min' : 'full'); } catch {} };
  useEffect(() => { if (!isMobile) setSheet(false); }, [isMobile]);
  useEffect(() => {
    if (!sheet) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setSheet(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [sheet]);

  useEffect(() => {
    getLessonVideos().then((d) => setLessonVideos(d.videos || [])).catch(() => {});
  }, []);
  const myVideo = (tid) => lessonVideos.find((v) => String(v.topicId) === String(tid));

  // Flatten the tree into an ordered lesson list for counting + prev/next.
  const flat = useMemo(() => {
    const arr = [];
    (program?.modules || []).forEach((m) => (m.chapters || []).forEach((c) => (c.topics || []).forEach((t) => arr.push({ topic: t, modId: m._id, chapId: c._id, mod: m.title, chap: c.title }))));
    return arr;
  }, [program]);
  const idx = flat.findIndex((f) => f.topic._id === topicId);
  const current = idx >= 0 ? flat[idx] : null;
  const topic = current?.topic || null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;

  const loadProgress = (programId) => {
    if (!isStudent || !programId) return;
    api(`/progress/me?programId=${programId}`).then((d) => { setCompleted(new Set(d.completedTopics)); setTotal(d.total); }).catch(() => {});
  };
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
      setOpenMod(target.modId);
      setTopicId(target.topic._id);
    } else {
      // Auto-open + select the very first lesson so the page is never empty.
      const firstMod = (p.modules || [])[0];
      const firstTopic = firstMod?.chapters?.[0]?.topics?.[0];
      setOpenMod(firstMod?._id || null);
      setTopicId(firstTopic?._id || null);
    }
    loadProgress(id);
  }
  function selectTopic(f) {
    setTopicId(f.topic._id);
    setOpenMod(f.modId);
    setSheet(false);
    // replace, not push — Prev/Next shouldn't fill the back button with lessons.
    if (program) setParams({ program: program._id, topic: String(f.topic._id) }, { replace: true });
  }

  useEffect(() => {
    // Students only see the program(s) of the batches they're enrolled in.
    // The summary list only ever reads .title/.published/._id — pick() always
    // fetches the full curriculum tree separately.
    Promise.all([api('/programs?fields=summary'), isStudent ? api('/batches') : Promise.resolve({ batches: null })])
      .then(async ([pd, bd]) => {
        let list = pd.programs || [];
        if (bd.batches) {
          const mine = new Set(bd.batches.map((b) => b.programId).filter(Boolean));
          list = list.filter((p) => mine.has(p._id) && p.published);
        }
        setPrograms(list);
        const wantP = params.get('program');
        const start = (wantP && list.find((p) => p._id === wantP)) ? wantP : list[0]?._id;
        // Awaited so the skeleton covers the curriculum fetch too, not just
        // the list — otherwise it flashes "Pick a programme to start."
        if (start) await pick(start, params.get('topic'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
    if (target) { setTopicId(target.topic._id); setOpenMod(target.modId); }
  }, [urlProgram, urlTopic]);

  // The page is sized to the viewport: everything above it is measured once
  // it's on screen (layout offset, not a viewport rect — the answer must not
  // depend on what has scrolled), and the bottom edge lands on the dock's
  // clearance. So the page has nothing left to scroll.
  const wsRef = useRef(null);
  const [wsTop, setWsTop] = useState(0);
  useLayoutEffect(() => {
    const el = wsRef.current;
    if (!el) return;
    const measure = () => {
      let top = 0;
      for (let n = el; n; n = n.offsetParent) top += n.offsetTop;
      setWsTop(Math.round(top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loading, program, flat.length]);

  // A new lesson starts at the top of its reading, and its row in the rail is
  // brought into view. The list is scrolled by hand, not with scrollIntoView:
  // on a phone the rail is a fixed sheet and scrollIntoView would drag the
  // whole page to chase it.
  const bodyRef = useRef(null);
  const railRef = useRef(null);
  const [read, setRead] = useState(0); // 0..1, how far down the reading you are
  const revealActive = () => {
    const list = railRef.current?.querySelector('.rmod.open .rmod-body');
    const row = list?.querySelector('.rlesson.active');
    if (!list || !row) return;
    const lr = list.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    const above = rr.top - lr.top - 8;
    const below = rr.bottom - lr.bottom + 8;
    if (above < 0) list.scrollTop += above;
    else if (below > 0) list.scrollTop += below;
  };
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    setRead(0);
    revealActive();
  }, [topicId]);
  useEffect(() => { if (sheet || !railMin) revealActive(); }, [sheet, railMin]);
  const onBodyScroll = (e) => {
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    setRead(max > 0 ? Math.min(1, el.scrollTop / max) : 1);
  };

  const goPrev = () => { if (idx > 0) selectTopic(flat[idx - 1]); };
  const goNext = () => { if (next) selectTopic(next); };

  // ← / → step between lessons when nothing else owns the keyboard.
  useEffect(() => {
    if (viewer || cert || sheet) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
  // No fallback file. A lesson with nothing attached says so — serving another
  // programme's PDF as if it were this lesson's reading is worse than showing
  // nothing, because it looks correct.
  const readingUrl = topic?.readingUrl || '';
  const notesUrl = topic?.notesUrl || '';
  const showProgress = isStudent && total > 0;
  const min = railMin && !isMobile;

  const railToggle = () => { if (isMobile) setSheet((v) => !v); else setMin(!railMin); };

  const shell = (inner) => (
    <div className={`cls ${min ? 'rail-min' : ''} ${sheet ? 'sheet-open' : ''}`}>
      {inner}
      {cert && <CertificateModal cert={cert} onClose={() => setCert(null)} />}
      {viewer && <FileViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );

  if (loading) return shell(<div className="panel cls-state"><Loading rows={5} /></div>);
  if (!program) return shell(<div className="panel cls-state"><Empty icon="programs" title="No programme yet." hint={isStudent ? 'You’ll see your course here once you’re enrolled in a batch.' : 'Create a programme under Programs and publish its curriculum.'} /></div>);
  if (flat.length === 0) return shell(<div className="panel cls-state"><Empty icon="learning" title="No lessons published yet." hint={isStudent ? 'Your mentor is still building this programme out. Check back soon.' : 'Add curriculum under Programs → Manage curriculum, then publish it.'} /></div>);

  return shell(
    <div className="cls-ws" ref={wsRef} style={{ '--cls-top': `${wsTop}px` }}>
      {/* ── The reader ── */}
      <section className="reader" aria-label="Lesson">
        <div className="reader-head">
          <div className="reader-top">
            <div className="reader-crumb" title={`${current.mod}${current.chap && current.chap !== 'Lessons' ? ` / ${current.chap}` : ''}`}>
              <span>{current.mod}</span>
              {current.chap && current.chap !== 'Lessons' && <span className="reader-crumb-chap"> / {current.chap}</span>}
            </div>
            <div className="reader-pos">{idx + 1} <span>/ {flat.length}</span></div>
            {/* Phones: the rail is a sheet, opened from here. */}
            <button className="reader-syl" onClick={() => setSheet(true)} aria-controls="cls-rail" aria-expanded={sheet}>
              <LineIcon name="list" size={15} /> {idx + 1}<span className="reader-syl-of">/{flat.length}</span>
            </button>
          </div>
          <h1 className="reader-title">{topic.title}</h1>
          <div className="reader-tools">
            {/* Reading and notes only. The class itself plays inline below, so
                a "join class" link up here would be a second door to the same
                room. */}
            <button className="rchip" disabled={!readingUrl} title={readingUrl ? undefined : 'Your mentor hasn’t attached the reading for this lesson yet'} onClick={() => setViewer({ label: 'Reading Material', subtitle: topic.title, url: readingUrl })}>
              <LessonIcon type="pdf" size={14} /> {readingUrl ? 'Reading material' : 'No reading yet'}
            </button>
            <button className="rchip" disabled={!notesUrl} title={notesUrl ? undefined : 'Your mentor hasn’t attached the notes for this lesson yet'} onClick={() => setViewer({ label: 'Teacher Notes', subtitle: topic.title, url: notesUrl })}>
              <LineIcon name="slides" size={14} /> {notesUrl ? 'Teacher notes' : 'No notes yet'}
            </button>
            {isDone && <span className="rchip is-done"><LineIcon name="check" size={14} /> Done</span>}
          </div>
          {/* How far through the reading you are — fills as the body scrolls. */}
          <div className="reader-read" aria-hidden="true"><span style={{ transform: `scaleX(${read})` }} /></div>
        </div>

        <div className="reader-body" ref={bodyRef} onScroll={onBodyScroll}>
          <div className="reader-inner">
            {topic.contentType === 'video' && myVideo(topic._id) && (
              <VdoCipherPlayer key={topic._id} fetchOtp={(takeover) => getLessonVideoOtp(myVideo(topic._id).batchId, topic._id, takeover)} />
            )}
            {topic.contentType === 'video' && !myVideo(topic._id) && topic.contentUrl && <LessonVideo key={topic._id} url={topic.contentUrl} />}
            {topic.contentType === 'pdf' && topic.contentUrl && <a className="btn" href={topic.contentUrl} target="_blank" rel="noreferrer">📄 Open PDF</a>}
            {topic.body ? <Markdown text={topic.body} /> : (topic.contentType === 'text' && <p className="muted">No content for this lesson yet.</p>)}
          </div>
        </div>

        <div className="reader-foot">
          <button className="btn sm rnav" disabled={idx <= 0} onClick={goPrev}>← Previous</button>
          {isStudent && (
            <button className={`btn sm rmark ${isDone ? 'is-done' : 'on-stage'}`} onClick={() => toggleComplete(topic._id)}>
              {isDone ? <><LineIcon name="check" size={15} /> Completed</> : 'Mark complete'}
            </button>
          )}
          {/* Next names where it goes — once this lesson is done it takes the
              fill, because it's now the obvious move. */}
          <button className={`btn sm rnav rnext ${isStudent && isDone && next ? 'on-stage' : ''}`} disabled={!next} onClick={goNext} title={next?.topic.title}>
            <span className="rnext-label">{next ? 'Next' : 'Last lesson'}</span>
            {next && <span className="rnext-title">{next.topic.title}</span>}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      {/* Phones: the scrim behind the sheet. */}
      <div className="cls-backdrop" onClick={() => setSheet(false)} aria-hidden="true" />

      {/* ── The rail ── */}
      <aside className="rail" id="cls-rail" ref={railRef} aria-label="Course">
        <div className="rail-head">
          {showProgress ? <Ring pct={pct} tone={pct === 100 ? 'ring-full' : ''} label={`${pct}% complete`} /> : <span className="ring ring-idle"><LineIcon name="list" size={16} /></span>}
          <div className="rail-head-copy">
            {programs.length > 1 ? (
              <select className="rail-pick" aria-label="Programme" value={program._id} onChange={(e) => { if (e.target.value) { setParams({ program: e.target.value }, { replace: true }); pick(e.target.value); } }}>
                {programs.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
              </select>
            ) : (
              <div className="rail-title" title={program.title}>{program.title}</div>
            )}
            <div className="rail-sub">{showProgress ? `${done} of ${total} lessons done` : `${flat.length} lessons`}</div>
          </div>
          <button className="rail-toggle" onClick={railToggle} aria-label={isMobile ? 'Close syllabus' : min ? 'Expand syllabus' : 'Collapse syllabus'} title={isMobile ? undefined : min ? 'Expand' : 'Collapse'}>
            <LineIcon name={isMobile ? 'close' : 'sidebar'} size={15} />
          </button>
        </div>
        {showProgress && pct === 100 && (
          <button className="btn sm rail-cert" onClick={viewCertificate}><LineIcon name="award" size={14} /> View certificate</button>
        )}

        <div className="rail-mods">
          {(program.modules || []).map((m, mi) => {
            const mTopics = (m.chapters || []).flatMap((c) => c.topics || []);
            const mDone = mTopics.filter((t) => completed.has(t._id)).length;
            const mPct = mTopics.length ? Math.round((mDone / mTopics.length) * 100) : 0;
            const isOpen = openMod === m._id;
            const here = current?.modId === m._id;
            return (
              <div key={m._id} className={`rmod ${isOpen ? 'open' : ''} ${here ? 'here' : ''} ${mTopics.length > 0 && mDone === mTopics.length ? 'complete' : ''}`}>
                <button
                  className="rmod-head"
                  onClick={() => { if (min) { setMin(false); setOpenMod(m._id); } else setOpenMod(isOpen ? null : m._id); }}
                  aria-expanded={isOpen}
                  title={min ? m.title : undefined}
                >
                  <span className="rmod-idx">{String(mi + 1).padStart(2, '0')}</span>
                  <span className="rmod-copy">
                    <span className="rmod-title">{m.title}</span>
                    <span className="rmod-bar"><span style={{ width: `${mPct}%` }} /></span>
                  </span>
                  {isStudent && mTopics.length > 0 && <span className="rmod-count">{mDone}/{mTopics.length}</span>}
                  <span className={`rmod-caret ${isOpen ? 'up' : ''}`}>⌄</span>
                </button>
                {isOpen && (
                  <div className="rmod-body">
                    {(m.chapters || []).map((c) => (
                      <div key={c._id} className="rchap">
                        {(m.chapters.length > 1 || c.title !== 'Lessons') && <div className="rchap-title">{c.title}</div>}
                        {(c.topics || []).map((t) => {
                          const active = t._id === topicId;
                          const tdone = completed.has(t._id);
                          return (
                            <button key={t._id} className={`rlesson ${active ? 'active' : ''} ${tdone ? 'done' : ''}`} onClick={() => selectTopic({ topic: t, modId: m._id, chapId: c._id })} aria-current={active ? 'true' : undefined}>
                              <span className="rtick" />
                              <span className="rlesson-title">{t.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>,
  );
}

// Lesson video with a graceful failure path — a dead CDN link or an
// unsupported codec should offer a retry and a direct link, not a black frame.
function LessonVideo({ url }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) {
    return (
      <div className="panel empty-state lesson-video-error">
        <p className="muted">This video couldn’t be loaded. It may have moved, or your connection dropped.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-3)' }}>
          <button className="btn sm" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</button>
          <a className="btn sm ghost" href={url} target="_blank" rel="noreferrer">Open in new tab</a>
        </div>
      </div>
    );
  }
  // preload="metadata": the first lesson is auto-selected on every visit, so
  // `auto` would pull a payload for a student who never pressed play.
  // playsInline keeps iOS Safari from yanking it to fullscreen on play.
  return <video key={attempt} src={url} controls playsInline preload="metadata" className="lesson-video" onError={() => setFailed(true)} />;
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
