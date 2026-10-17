import { useEffect, useState } from 'react';
import FileViewer from '../components/FileViewer.jsx';
import ReadingPicker, { openOutside, opensInReader } from '../components/ReadingPicker.jsx';
import Markdown from '../components/Markdown.jsx';
import LineIcon from '../components/LineIcon.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import CertificateModal from '../components/CertificateModal.jsx';
import AssignmentCard, { STATE_LABEL, relative } from '../components/AssignmentCard.jsx';
import QuizCard from '../components/QuizCard.jsx';
import { DrivePlayer } from '../components/Classroom.jsx';
import { isDirectVideoFile, countLabel } from '../features.js';
import { classState, fmtWhen, workTitle } from './useCourse.js';

// The pieces every layout draws the same way: the PDF reader and the notes
// list, a lesson's chips and body, a work row, a class row, a sheet that
// slides over whatever the layout is.

export function useViewers() {
  const [viewer, setViewer] = useState(null);
  const [picker, setPicker] = useState(null);
  const [cert, setCert] = useState(null);
  const openNote = (it, label) => { if (opensInReader(it.url, it.name)) setViewer({ label, subtitle: it.name, url: it.url }); else openOutside(it); };
  const nodes = (
    <>
      {picker && <ReadingPicker title={picker.title} items={picker.items} label={picker.label} onOpen={(it) => { setPicker(null); openNote(it, picker.label); }} onClose={() => setPicker(null)} />}
      {viewer && <FileViewer {...viewer} onClose={() => setViewer(null)} />}
      {cert && <CertificateModal cert={cert} onClose={() => setCert(null)} />}
    </>
  );
  return { viewer, picker, setViewer, setPicker, setCert, openNote, busy: !!(viewer || picker || cert), nodes };
}

// Reading · Notes · Video, as chips. `tone` = 'stage' (parchment on indigo,
// the classic look) or 'paper'.
export function Chips({ f, media, viewers, onWatch, done, tone = 'stage' }) {
  const { L } = media;
  const cls = tone === 'stage' ? 'rchip' : 'pchip';
  const notes = media.notes;
  return (
    <div className={tone === 'stage' ? 'reader-tools' : 'pchips'}>
      <button className={cls} disabled={!media.reading} onClick={() => viewers.setViewer({ label: L.reading, subtitle: f.topic.title, url: media.reading })}><LessonIcon type="pdf" size={14} /> {media.reading ? L.reading : L.noReading}</button>
      <button className={cls} disabled={!notes.length} onClick={() => (notes.length === 1 ? viewers.openNote(notes[0], L.notes) : viewers.setPicker({ title: f.topic.title, items: notes, label: L.notes }))}>
        <LineIcon name="slides" size={14} /> {notes.length === 0 ? L.noNotes : notes.length === 1 ? L.notes : countLabel(notes.length, L.notesMany)}
      </button>
      {media.drive ? <button className={cls} onClick={onWatch}><LineIcon name="video" size={14} /> Watch class video</button>
        : media.video ? <a className={cls} href={media.video} target="_blank" rel="noreferrer"><LineIcon name="video" size={14} /> Watch class video</a>
        : <button className={cls} disabled><LineIcon name="video" size={14} /> Video not available yet</button>}
      {done && <span className={`${cls} is-done`}><LineIcon name="check" size={14} /> Done</span>}
    </div>
  );
}

// The lesson itself: player, body. Chips are the layout's to place.
export function LessonBody({ f, media, viewers, playing, setPlaying }) {
  const t = f.topic;
  return (
    <>
      {media.drive && <DrivePlayer link={media.drive} title={t.title} on={playing === f.id} onPlay={() => setPlaying(f.id)} />}
      {t.contentType === 'video' && t.contentUrl && isDirectVideoFile(t.contentUrl) && <video src={t.contentUrl} controls playsInline preload="metadata" className="lesson-video" />}
      {t.contentType === 'pdf' && t.contentUrl && <button type="button" className="btn" onClick={() => viewers.setViewer({ label: 'Lesson PDF', subtitle: t.title, url: t.contentUrl })}>📄 Open PDF</button>}
      {t.body ? <Markdown text={t.body} /> : <p className="muted">No content for this lesson yet.</p>}
    </>
  );
}

// Previous · Mark complete · Next, with the handoff to the week's work on
// the last lesson of a week.
export function LessonFoot({ course, isStudent, onWork, tone = 'stage' }) {
  const { current: f, prev, next, isDone, toggle, open, workFor, tier } = course;
  if (!f) return null;
  const done = isDone(f.topic);
  const lastOfWeek = !next || next.mi !== f.mi;
  const handoff = lastOfWeek ? workFor(f.mod).find((w) => w.row && w.state !== 'graded') : null;
  return (
    <div className={tone === 'stage' ? 'reader-foot' : 'reader-foot pfoot'}>
      <button className="btn sm rnav" disabled={!prev} onClick={() => open(prev)}>← Previous</button>
      {isStudent && <button className={`btn sm rmark ${done ? 'is-done' : 'on-stage'}`} onClick={() => toggle(f.id)}>{done ? <><LineIcon name="check" size={15} /> Completed</> : 'Mark complete'}</button>}
      {handoff && onWork ? (
        <button className={`btn sm rnav rnext ${isStudent && done ? 'on-stage' : ''}`} onClick={() => onWork(handoff)} title={handoff.row.title}>
          <span className="rnext-label">Start this {tier(f.mod).top.toLowerCase()}’s {handoff.kind}</span><span className="rnext-title">{workTitle(handoff.row.title)}</span><span aria-hidden="true">→</span>
        </button>
      ) : (
        <button className={`btn sm rnav rnext ${isStudent && done && next ? 'on-stage' : ''}`} disabled={!next} onClick={() => open(next)} title={next?.topic.title}>
          <span className="rnext-label">{next ? (next.mi !== f.mi ? `Next ${tier(next.mod).top.toLowerCase()}` : 'Next') : 'Last lesson'}</span>{next && <span className="rnext-title">{next.topic.title}</span>}<span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}

// ← → between lessons, M marks done, when nothing else owns the keys.
export function useLessonKeys(course, { enabled = true, isStudent } = {}) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft' && course.prev) course.open(course.prev);
      else if (e.key === 'ArrowRight' && course.next) course.open(course.next);
      else if ((e.key === 'm' || e.key === 'M') && isStudent && course.current) course.toggle(course.current.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

export function StatePill({ state, row }) {
  if (!state) return <span className="lpill is-none">brief only</span>;
  const text = state === 'graded' && row?.mySubmission?.score != null ? `${row.mySubmission.score}/10` : STATE_LABEL[state];
  return <span className={`lpill st-${state}`}>{text}</span>;
}

// One row for a piece of work. Clicking opens it (the card in a sheet) or,
// with no Assignment row behind it, the brief lesson.
export function WorkRow({ w, onOpen, compact }) {
  return (
    <button type="button" className={`lrow lrow-work ${compact ? 'sm' : ''}`} onClick={() => onOpen(w)}>
      <span className="lmark"><LineIcon name="file" size={14} /></span>
      <span className="lrow-title"><em>{w.kind}</em>{workTitle(w.node.title)}</span>
      <span className="lrow-side">{w.row?.dueDate && w.state !== 'graded' && <span className="ldim">due {relative(w.row.dueDate)} · </span>}<StatePill state={w.state} row={w.row} /></span>
    </button>
  );
}

export function ClassRow({ s, compact }) {
  const st = classState(s);
  const href = st === 'live' ? s.joinUrl : st === 'past' ? s.recordingUrl : '';
  const Tag = href ? 'a' : 'div';
  return (
    <Tag className={`lrow lrow-class is-${st} ${compact ? 'sm' : ''}`} {...(href ? { href, target: '_blank', rel: 'noreferrer' } : {})}>
      <span className="lmark"><LineIcon name={st === 'past' ? 'video' : 'clock'} size={14} /></span>
      <span className="lrow-title"><em>Live class</em>{s.title}</span>
      <span className="lrow-side">
        {st === 'live' ? <span className="lpill st-live">Join now</span> : st === 'past' ? (s.recordingUrl ? 'Recording' : 'No recording yet') : <>{fmtWhen(s.startsAt)}<span className="ldim"> · join opens 5 min before</span></>}
      </span>
    </Tag>
  );
}

export function QuizRow({ q, onOpen, compact }) {
  return (
    <button type="button" className={`lrow lrow-work ${compact ? 'sm' : ''}`} onClick={() => onOpen(q)}>
      <span className="lmark"><LineIcon name="list" size={14} /></span>
      <span className="lrow-title"><em>quiz</em>{q.title}</span>
      <span className="lrow-side"><span className="lpill st-todo">To take</span></span>
    </button>
  );
}

export function LessonRow({ f, course, active, onOpen, compact, showMin = true }) {
  const done = course.isDone(f.topic);
  return (
    <button type="button" className={`lrow ${done ? 'is-done' : ''} ${active ? 'is-active' : ''} ${compact ? 'sm' : ''}`} onClick={() => onOpen(f)} aria-current={active ? 'true' : undefined}>
      <span className="lmark">{done ? <LineIcon name="check" size={14} /> : active ? <LineIcon name="play" size={12} className="lplay" /> : <span className="lring" />}</span>
      <span className="lrow-title">{f.topic.title}</span>
      {showMin && <span className="lrow-side">{done ? 'done' : course.lessonMinutes(f.topic.title) ? `${course.lessonMinutes(f.topic.title)} min` : ''}</span>}
    </button>
  );
}

// A sheet over the layout: for work, a quiz, or (in the card layout) a lesson.
export function Sheet({ title, onClose, children, side = 'right', light = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevO = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevO; };
  }, [onClose]);
  return (
    <div className={`lsheet-overlay from-${side}`} onClick={onClose}>
      <section className={`lsheet ${light ? 'is-light' : ''}`} onClick={(e) => e.stopPropagation()} aria-label={title}>
        <div className="lsheet-bar"><span className="lsheet-title">{title}</span><button type="button" className="lsheet-x" onClick={onClose} aria-label="Close"><LineIcon name="close" size={16} /></button></div>
        <div className="lsheet-body">{children}</div>
      </section>
    </div>
  );
}

// Work or quiz, opened in a sheet. One state per layout: { kind, item }.
export function WorkSheet({ item, course, onClose }) {
  if (!item) return null;
  if (item.kind === 'quiz') return <Sheet title="Quiz" onClose={onClose} light><QuizCard quiz={item.q} onDone={course.reloadWork} /></Sheet>;
  const w = item.w;
  if (!w.row) return null;
  return (
    <Sheet title={w.kind === 'project' ? 'Project' : 'Assignment'} onClose={onClose} light>
      <AssignmentCard a={w.row} defaultOpen onChange={course.reloadWork} onSubmissionChange={course.spliceSubmission} />
    </Sheet>
  );
}

// What a layout does when a work row is pressed: a row with an Assignment
// behind it opens the sheet; one without opens its brief lesson.
export const pressWork = (course, setSheet) => (w) => { if (w.row) setSheet({ kind: 'work', w }); else if (w.lesson) course.open(course.byId.get(String(w.lesson._id))); };
