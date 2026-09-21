import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import CertificateModal from './CertificateModal.jsx';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api, getLessonVideos, getLessonVideoOtp } from '../api.js';
import FileViewer from './FileViewer.jsx';
import ReadingPicker, { opensInReader } from './ReadingPicker.jsx';
import Markdown from './Markdown.jsx';
import LessonIcon from './LessonIcon.jsx';
import LineIcon from './LineIcon.jsx';
import Empty, { Loading } from './Empty.jsx';
import VdoCipherPlayer from './VdoCipherPlayer.jsx';
import { VDOCIPHER_ENABLED, isDirectVideoFile, tierNames, isAssignmentChapter, isProjectChapter, workKind, materialLabels } from '../features.js';
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
  // A week or a session opened from the rail shows its own page in the reader
  // — the objective and outcome, or what the session carries forward — until a
  // lesson is picked. A page is not a lesson: nothing to mark, not counted,
  // and it doesn't take the URL. `{ kind: 'module' | 'chapter', id }`.
  const [pageRef, setPageRef] = useState(null);
  // The session unfolded inside the open week, if any — the second accordion.
  const [openChap, setOpenChap] = useState(null);
  const [completed, setCompleted] = useState(new Set());
  const [total, setTotal] = useState(0);
  const [cert, setCert] = useState(null);
  const [viewer, setViewer] = useState(null); // { label, subtitle, url }
  // The list behind the Teacher notes chip when there is more than one
  // thing to open: { title, items: [{ url, name, from }] }.
  const [picker, setPicker] = useState(null);
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
    (program?.modules || []).forEach((m) => (m.chapters || []).forEach((c) => (c.topics || []).forEach((t) => arr.push({ topic: t, modId: m._id, chapId: c._id, mod: m.title, chap: c.title, modNode: m, chapNode: c }))));
    return arr;
  }, [program]);
  const idx = flat.findIndex((f) => f.topic._id === topicId);
  const current = idx >= 0 ? flat[idx] : null;
  const topic = current?.topic || null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  // The page on show, if any — resolved to everything the reader needs to
  // draw it with a lesson's own furniture. Only a week or session that has
  // something to say has a page; the rest open straight onto their lessons.
  const has = (n) => !!n?.description?.trim();
  // In the rail a session sits under its own week, so repeating "Week 3:" in
  // every row costs a line of a two-line clamp and tells you nothing you can't
  // read directly above it.
  const chapLabel = (t) => String(t).replace(/\s*·\s*Week\s*\d+:\s*/, ' · ');
  const page = useMemo(() => {
    if (!pageRef || !program) return null;
    const mods = program.modules || [];
    if (pageRef.kind === 'module') {
      const mi = mods.findIndex((m) => m._id === pageRef.id);
      if (mi < 0 || !has(mods[mi])) return null;
      return { node: mods[mi], mod: mods[mi], chap: null, title: 'Week overview', crumb: mods[mi].title, pos: mi + 1, of: mods.length, go: 'Start week' };
    }
    for (const m of mods) {
      const ci = (m.chapters || []).findIndex((c) => c._id === pageRef.id);
      if (ci < 0) continue;
      const c = m.chapters[ci];
      if (!has(c)) return null;
      return { node: c, mod: m, chap: c, title: c.pageLabel || 'Overview', crumb: `${m.title} / ${c.title}`, pos: ci + 1, of: m.chapters.length, go: c.pageLabel ? 'Next' : 'Start session' };
    }
    return null;
  }, [pageRef, program]);
  // Where a page's Previous and Next land: Next starts the thing you're
  // looking at, Previous steps back to the lesson before it began.
  const pageFirst = page ? flat.find((f) => (page.chap ? f.chapId === page.chap._id : f.modId === page.mod._id)) || null : null;
  const pageFirstIdx = pageFirst ? flat.indexOf(pageFirst) : -1;
  const pagePrev = pageFirstIdx > 0 ? flat[pageFirstIdx - 1] : null;
  // A week or a session carries its own ebook and notes — that is how the
  // books are organised, one per week or per week+session — and what it has
  // not got, the lessons under it might: the class link, a lesson's own PDF.
  // Those are exactly the things a student is looking for when the page is
  // open, so take the node's own first, then the first lesson's that is set,
  // so the chips mean the same here as on a lesson.
  const pageLessons = page ? flat.filter((f) => (page.chap ? f.chapId === page.chap._id : f.modId === page.mod._id)) : [];
  const fromLessons = (field) => pageLessons.map((f) => f.topic[field]).find(Boolean) || '';
  // A week's ebook is not the brief of the assignment filed under it, so a
  // work chapter resolves to its own file and its lessons' — never upwards.
  const pageKind = page ? workKind({ chapter: page.chap?.title }) : null;
  const pageMedia = (field) => (page ? page.node[field] || (page.chap && !pageKind ? page.mod[field] : '') || fromLessons(field) : '');
  // Every note there is here, as one list: the teacher-notes slot the lesson
  // resolves to, then every file a mentor pushed onto the lesson, its session
  // and its week. Notes, not reading: the reading is the ebook the admin
  // attached, and what a mentor puts up after class — the deck, a notice —
  // is what a student means by "the notes". The mentor's page says "drop the
  // session's files on the session", so a lesson has to show the session's
  // files or that promise is broken. Deduped on url.
  const notesListFor = ({ own, lesson, chap, mod }) => {
    const items = [];
    const seen = new Set();
    const kind = workKind({ lesson: lesson?.title, chapter: chap?.title });
    const ownName = materialLabels(kind).notes;
    const push = (url, name, from, k = 'notes') => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({ url, name: name || ownName, from, kind: k === 'resource' ? 'resource' : 'notes' });
    };
    const names = tierNames(mod?.title);
    if (own) push(own, ownName, 'the notes');
    for (const x of lesson?.materials || []) push(x.url, x.name, 'this lesson', x.kind);
    // A piece of work's notes are its solution book; the session's handouts
    // stay on the lessons they were taught with. Judged on the lesson
    // (Kickstarter's "Assignment: …", "P01 · …") and on the chapter
    // (Generalist's weekly assignment and milestone project).
    if (!kind) {
      for (const x of chap?.materials || []) push(x.url, x.name, names.fromSub, x.kind);
      for (const x of mod?.materials || []) push(x.url, x.name, names.fromTop, x.kind);
    }
    return items;
  };
  // On a session page: the session's files and the week's. On a week page:
  // the week's, plus what its lessons carry, as the other chips already do.
  const pageNotes = page ? notesListFor({
    own: pageMedia('notesUrl'),
    lesson: { materials: pageLessons.flatMap((f) => f.topic.materials || []) },
    chap: page.chap,
    mod: page.mod,
  }) : [];

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
    setProgram(p); setCert(null); setPageRef(null);
    const target = preferTopicId ? locate(p, preferTopicId) : null;
    if (target) {
      setOpenMod(target.modId);
      setOpenChap(target.chapId);
      setTopicId(target.topic._id);
    } else {
      // Nothing named in the URL: open nothing. A link to a lesson still lands
      // on that lesson; simply arriving lands on the syllabus, which is the
      // choice this page exists to offer.
      setOpenMod(null);
      setOpenChap(null);
      setTopicId(null);
    }
    loadProgress(id);
  }
  function selectTopic(f) {
    setTopicId(f.topic._id);
    setOpenMod(f.modId);
    setOpenChap(f.chapId);
    setPageRef(null);
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
    if (target) { setTopicId(target.topic._id); setOpenMod(target.modId); setOpenChap(target.chapId); setPageRef(null); }
  }, [urlProgram, urlTopic]);

  // Open a week from the rail. A week with a page of its own shows it; a
  // click on the week that is already open folds it back up.
  function openModule(m) {
    const hasPage = has(m);
    const ref = hasPage ? { kind: 'module', id: m._id } : null;
    if (min) { setMin(false); setOpenMod(m._id); setPageRef(ref); setOpenChap(null); return; }
    // Clicking the week that's already open folds it away again — unless its
    // page is what brings you back, in which case the first click shows that.
    const onIt = pageRef?.kind === 'module' && pageRef.id === m._id;
    if (openMod === m._id && (!hasPage || onIt)) { setOpenMod(null); setPageRef(null); setOpenChap(null); return; }
    setOpenMod(m._id);
    setPageRef(ref);
    setOpenChap(null);
  }

  // Press a session in the rail: unfold it AND put its page on the stage, the
  // way a week's header does. It used to only unfold, so pressing "Weekly
  // Assignment" left the previous lesson — and that lesson's teacher notes —
  // on the stage, which read as the assignment carrying the session's notes.
  // Pressing the session you are already on folds it away and returns you to
  // whatever lesson was open underneath.
  function toggleChapter(c) {
    const onIt = pageRef?.kind === 'chapter' && pageRef.id === c._id;
    if (openChap === c._id && onIt) { setOpenChap(null); setPageRef(null); return; }
    setOpenChap(c._id);
    setPageRef({ kind: 'chapter', id: c._id });
  }
  // ...and this is choosing something inside it.
  function showChapterPage(c) {
    setOpenChap(c._id);
    setPageRef({ kind: 'chapter', id: c._id });
    setSheet(false);
  }

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
  }, [topicId, pageRef]);
  useEffect(() => { if (sheet || !railMin) revealActive(); }, [sheet, railMin]);
  const onBodyScroll = (e) => {
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    setRead(max > 0 ? Math.min(1, el.scrollTop / max) : 1);
  };

  // From a module page, Next starts the week and Prev steps back to the
  // end of the week before it.
  const goPrev = () => { if (page) { if (pagePrev) selectTopic(pagePrev); } else if (idx > 0) selectTopic(flat[idx - 1]); };
  const goNext = () => { if (page) { if (pageFirst) selectTopic(pageFirst); } else if (next) selectTopic(next); };

  // ← / → step between lessons when nothing else owns the keyboard.
  useEffect(() => {
    if (viewer || picker || cert || sheet) return;
    // Nothing open yet — the arrows have nowhere to step from.
    if (!topicId && !pageRef) return;
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
  // A lesson's reading is its own, else its session's, else its week's — the
  // ebook is attached once, where it belongs, and every lesson under it opens
  // it. No fallback beyond that: a lesson with nothing attached anywhere says
  // so, because serving another programme's PDF as if it were this lesson's
  // reading is worse than showing nothing. It looks correct.
  //
  // A piece of work is the exception: its reading is the brief it is marked
  // against and its notes are the solution book, so it never climbs past
  // itself. Serving the week's ebook under the words "Assignment brief" is
  // the one failure a student cannot detect — it looks correct.
  const lessonKind = workKind({ lesson: topic?.title, chapter: current?.chapNode?.title });
  // …except where the WORK is the chapter (Generalist files its weekly
  // assignment that way), in which case the chapter is still part of it.
  const workChap = isAssignmentChapter(current?.chapNode?.title) || isProjectChapter(current?.chapNode?.title);
  const inherit = (field) => (lessonKind
    ? topic?.[field] || (workChap ? current?.chapNode?.[field] : '') || ''
    : topic?.[field] || current?.chapNode?.[field] || current?.modNode?.[field] || '');
  const readingUrl = inherit('readingUrl');
  const notesUrl = inherit('notesUrl');
  const lessonNotes = topic ? notesListFor({ own: notesUrl, lesson: topic, chap: current?.chapNode, mod: current?.modNode }) : [];
  const showProgress = isStudent && total > 0;
  const min = railMin && !isMobile;
  // The waiting state: no lesson open and no week page on show.
  const blank = !topic && !page;

  const railToggle = () => { if (isMobile) setSheet((v) => !v); else setMin(!railMin); };

  // The chips are the same row on a lesson, a session page and a week page —
  // a student shouldn't have to work out which screen still offers the
  // reading. Only the very first landing screen has none, because nothing is
  // open yet for them to point at.
  // A lesson's video can be pasted in either of two places -- the class link
  // (the recording of the live session) or the lesson's own video URL -- and a
  // student does not care which box a mentor used. The chip lights for either.
  const videoRow = ({ classLink, video }) => classLink || video || '';

  // One note opens straight away; more than one opens the list. A link that
  // is not a PDF goes to a new tab rather than into the reader.
  const openNote = (it, subtitle, label = 'Teacher Notes') => {
    setPicker(null);
    if (opensInReader(it.url)) setViewer({ label, subtitle: it.name === label ? subtitle : it.name, url: it.url });
    else window.open(it.url, '_blank', 'noopener');
  };
  // `kind` renames the two PDF chips where the lesson is a piece of work —
  // see materialLabels(). Everything else about the row is the same.
  const toolsRow = ({ reading, notes, classLink, video, subtitle, done, kind }) => {
    const L = materialLabels(kind);
    return (
    <div className="reader-tools">
      <button className="rchip" disabled={!reading} title={reading ? undefined : `Your mentor hasn’t attached the ${L.reading.toLowerCase()} for this yet`} onClick={() => setViewer({ label: L.reading, subtitle, url: reading })}>
        <LessonIcon type="pdf" size={14} /> {reading ? L.reading : L.noReading}
      </button>
      <button
        className="rchip"
        disabled={!notes.length}
        title={notes.length ? undefined : `Your mentor hasn’t attached the ${L.notes.toLowerCase()} for this yet`}
        onClick={() => (notes.length === 1 ? openNote(notes[0], subtitle, L.notes) : setPicker({ title: subtitle, items: notes, subtitle, label: L.notes }))}
      >
        <LineIcon name="slides" size={14} /> {notes.length === 0 ? L.noNotes : notes.length === 1 ? L.notes : `${notes.length} ${L.notesMany}`}
        {notes.length > 1 && <span className="rchip-caret" aria-hidden="true"><LineIcon name="chevron" size={12} /></span>}
      </button>
      {/* The class recording / live link. Kept as a chip even when there is
          nothing to open: a student who cannot see a video button assumes the
          video is missing; "not yet" tells them to come back. */}
      {videoRow({ classLink, video }) ? (
        <a className="rchip" href={videoRow({ classLink, video })} target="_blank" rel="noreferrer"><LineIcon name="video" size={14} /> Watch class video</a>
      ) : (
        <button className="rchip" disabled title="Your mentor hasn’t posted this class’s video yet"><LineIcon name="video" size={14} /> Video not available yet</button>
      )}
      {done && <span className="rchip is-done"><LineIcon name="check" size={14} /> Done</span>}
    </div>
    );
  };

  const shell = (inner) => (
    <div className={`cls ${min ? 'rail-min' : ''} ${sheet ? 'sheet-open' : ''}`}>
      {inner}
      {cert && <CertificateModal cert={cert} onClose={() => setCert(null)} />}
      {picker && <ReadingPicker title={picker.title} items={picker.items} label={picker.label} onOpen={(it) => openNote(it, picker.subtitle, picker.label)} onClose={() => setPicker(null)} />}
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
        {/* Nothing picked yet. Arriving on Learning used to drop you into the
            first lesson of the first week, which is somebody's idea of where
            to start, not yours — so the stage waits and the syllabus is the
            thing to act on. */}
        {blank ? (
          <div className="reader-blank">
            <div className="reader-blank-inner">
              <p className="reader-blank-eyebrow">{program.title}</p>
              <h1 className="reader-title">{flat.length} lessons, {(program.modules || []).length} weeks.</h1>
              <p className="reader-blank-hint">Open a week {isMobile || min ? 'in the syllabus' : 'on the left'} to see what it covers, then pick a lesson to start reading.</p>
              {/* Only where the syllabus isn't already sitting open beside you. */}
              {(isMobile || min) && (
                <button className="btn sm on-stage reader-blank-cta" onClick={() => (isMobile ? setSheet(true) : setMin(false))}>
                  <LineIcon name="menu" size={15} /> Open the syllabus
                </button>
              )}
            </div>
          </div>
        ) : (<>
        {page ? (
          /* ── A week's or a session's own page, on the stage. Built from the
               same parts as a lesson, in the same order — where you are in the
               crumb, what you're reading as the title, the counter on the
               right — so moving between the two isn't a change of scenery. ── */
          <div className="reader-head">
            <div className="reader-top">
              <div className="reader-crumb" title={page.crumb}><span>{page.crumb}</span></div>
              <div className="reader-pos">{page.pos} <span>/ {page.of}</span></div>
              <button className="reader-syl" onClick={() => setSheet(true)} aria-controls="cls-rail" aria-expanded={sheet}>
                <LineIcon name="menu" size={16} /> Syllabus <span className="reader-syl-of">{page.pos}/{page.of}</span>
              </button>
            </div>
            <h1 className="reader-title">{page.title}</h1>
            {toolsRow({ reading: pageMedia('readingUrl'), notes: pageNotes, classLink: fromLessons('classLink'), video: fromLessons('contentUrl'), subtitle: page.crumb, kind: pageKind })}
            <div className="reader-read" aria-hidden="true"><span style={{ transform: `scaleX(${read})` }} /></div>
          </div>
        ) : (
        <div className="reader-head">
          <div className="reader-top">
            <div className="reader-crumb" title={`${current.mod}${current.chap && current.chap !== 'Lessons' ? ` / ${current.chap}` : ''}`}>
              <span>{current.mod}</span>
              {current.chap && current.chap !== 'Lessons' && <span className="reader-crumb-chap"> / {current.chap}</span>}
            </div>
            <div className="reader-pos">{idx + 1} <span>/ {flat.length}</span></div>
            {/* Phones: the rail is a sheet, opened from here. Labelled, not just an
                icon — a bare list glyph next to "1/115" read as a counter, and
                nobody found the index behind it. */}
            <button className="reader-syl" onClick={() => setSheet(true)} aria-controls="cls-rail" aria-expanded={sheet}>
              <LineIcon name="menu" size={16} /> Syllabus <span className="reader-syl-of">{idx + 1}/{flat.length}</span>
            </button>
          </div>
          <h1 className="reader-title">{topic.title}</h1>
          {toolsRow({ reading: readingUrl, notes: lessonNotes, classLink: topic.classLink, video: topic.contentType === 'video' ? topic.contentUrl : '', subtitle: topic.title, done: isDone, kind: lessonKind })}
          {/* How far through the reading you are — fills as the body scrolls. */}
          <div className="reader-read" aria-hidden="true"><span style={{ transform: `scaleX(${read})` }} /></div>
        </div>
        )}

        <div className="reader-body" ref={bodyRef} onScroll={onBodyScroll}>
          {page ? (
            <div className="reader-inner">
              <Markdown text={page.node.description} />
            </div>
          ) : (
          <div className="reader-inner">
            {VDOCIPHER_ENABLED && topic.contentType === 'video' && myVideo(topic._id) && (
              <VdoCipherPlayer key={topic._id} fetchOtp={(takeover) => getLessonVideoOtp(myVideo(topic._id).batchId, topic._id, takeover)} />
            )}
            {/* Only a real media file plays here. A video hosted elsewhere -- a
                Drive file, YouTube, Loom -- is reached through the "Watch class
                video" chip in the header above, which opens the same link
                (videoRow = classLink || video). There used to be a hand-off card
                here as well, which meant the same link appeared twice on one
                screen. */}
            {topic.contentType === 'video' && (!VDOCIPHER_ENABLED || !myVideo(topic._id))
              && topic.contentUrl && isDirectVideoFile(topic.contentUrl) && (
              <LessonVideo key={topic._id} url={topic.contentUrl} />
            )}
            {topic.contentType === 'pdf' && topic.contentUrl && (
              <button type="button" className="btn" onClick={() => setViewer({ label: 'Lesson PDF', subtitle: topic.title, url: topic.contentUrl })}>📄 Open PDF</button>
            )}
            {topic.body ? <Markdown text={topic.body} /> : (topic.contentType === 'text' && <p className="muted">No content for this lesson yet.</p>)}
          </div>
          )}
        </div>

        {page ? (
          <div className="reader-foot">
            <button className="btn sm rnav" disabled={!pagePrev} onClick={goPrev}>← Previous</button>
            {/* Nothing to mark on a page; the fill goes to starting the thing. */}
            <button className="btn sm rnav rnext on-stage" disabled={!pageFirst} onClick={goNext} title={pageFirst?.topic.title}>
              <span className="rnext-label">{pageFirst ? page.go : 'No lessons yet'}</span>
              {pageFirst && <span className="rnext-title">{pageFirst.topic.title}</span>}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : (
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
        )}
        </>)}
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
            const onPage = page?.mod?._id === m._id;
            const here = onPage || (!page && current?.modId === m._id);
            return (
              <div key={m._id} className={`rmod ${isOpen ? 'open' : ''} ${here ? 'here' : ''} ${mTopics.length > 0 && mDone === mTopics.length ? 'complete' : ''}`}>
                <button
                  className="rmod-head"
                  onClick={() => openModule(m)}
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
                    {(m.chapters || []).map((c) => {
                      // A session with a page of its own is a dropdown inside
                      // the week's: pressing it unfolds it and opens its page
                      // (the brief, for an assignment). A chapter with no
                      // page is a plain label with its lessons under it.
                      const fold = has(c);
                      const cOpen = !fold || openChap === c._id;
                      const onChapPage = page?.chap?._id === c._id;
                      return (
                      <div key={c._id} className={`rchap ${fold ? 'rchap-fold' : ''} ${cOpen ? 'open' : ''}`}>
                        {fold ? (
                          <button className={`rchap-head ${onChapPage ? 'here' : ''}`} onClick={() => toggleChapter(c)} aria-expanded={cOpen}>
                            <span className="rchap-name">{chapLabel(c.title)}</span>
                            <span className={`rmod-caret ${cOpen ? 'up' : ''}`}>⌄</span>
                          </button>
                        ) : (m.chapters.length > 1 || c.title !== 'Lessons') && <div className="rchap-title">{c.title}</div>}
                        {cOpen && fold && (
                          <button className={`rlesson rlesson-ov ${onChapPage ? 'active' : ''}`} onClick={() => showChapterPage(c)} aria-current={onChapPage ? 'true' : undefined}>
                            <LineIcon name="list" size={13} className="rov-icon" />
                            <span className="rlesson-title">{c.pageLabel || 'Overview'}</span>
                          </button>
                        )}
                        {cOpen && (c.topics || []).map((t) => {
                          const active = !page && t._id === topicId;
                          const tdone = completed.has(t._id);
                          return (
                            <button key={t._id} className={`rlesson ${active ? 'active' : ''} ${tdone ? 'done' : ''}`} onClick={() => selectTopic({ topic: t, modId: m._id, chapId: c._id })} aria-current={active ? 'true' : undefined}>
                              <span className="rtick" />
                              <span className="rlesson-title">{t.title}</span>
                            </button>
                          );
                        })}
                      </div>
                      );
                    })}
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


