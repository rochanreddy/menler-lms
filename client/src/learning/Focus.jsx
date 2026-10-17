import { useEffect, useRef, useState } from 'react';
import LineIcon from '../components/LineIcon.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import { LessonBody, LessonRow, WorkRow, ClassRow, QuizRow, Sheet, WorkSheet, pressWork, useLessonKeys } from './shared.jsx';
import { chapLabel, classState, fmtWhen } from './useCourse.js';

// 4 · The Focus. One lesson on screen, set wide, and nothing else. A thin
// icon rail opens a drawer for the syllabus, the reading, the work and the
// class; each goes away again. The next step is always the big button.
export default function Focus({ course, viewers, isStudent }) {
  const { mods, flat, current: f, next, prev, hereIdx, modState, modDone, modLessons, tier, workFor, classFor, openQuizzes, mediaFor, open, byId, pct, idx, isDone, toggle, isWorkChap, isWorkLesson, program } = course;
  const [drawer, setDrawer] = useState(null); // 'syllabus' | 'reading' | 'work' | 'class'
  const [sheet, setSheet] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [read, setRead] = useState(0);
  const bodyRef = useRef(null);
  const onWork = pressWork(course, setSheet);
  const media = mediaFor(f);
  useLessonKeys(course, { enabled: !viewers.busy && !sheet && !drawer, isStudent });
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; setRead(0); }, [f?.id]);
  const onScroll = (e) => { const el = e.currentTarget; const max = el.scrollHeight - el.clientHeight; setRead(max > 0 ? Math.min(1, el.scrollTop / max) : 1); };
  if (!f) return <p className="muted">Pick a lesson.</p>;
  const T = tier(f.mod);
  const work = workFor(f.mod); const dueN = work.filter((w) => w.state && w.state !== 'graded' && w.state !== 'review').length + (f.mi === hereIdx ? openQuizzes.length : 0);
  const cls = classFor(f.mod); const nextClass = cls.find((s) => classState(s) !== 'past'); const live = cls.find((s) => classState(s) === 'live');
  const done = isDone(f.topic);
  const lastOfWeek = !next || next.mi !== f.mi;
  const handoff = lastOfWeek ? work.find((w) => w.row && w.state !== 'graded') : null;

  const rail = [
    { k: 'syllabus', icon: 'menu', label: 'Syllabus' },
    { k: 'reading', icon: 'file', label: 'Reading & notes', dot: !!(media.reading || media.notes.length) },
    { k: 'work', icon: 'list', label: 'Work', badge: dueN },
    { k: 'class', icon: 'video', label: 'Class', live: !!live },
  ];

  return (
    <div className="foc">
      <nav className="foc-rail" aria-label="Lesson tools">
        {rail.map((r) => (
          <button key={r.k} type="button" className={`foc-rail-btn ${drawer === r.k ? 'on' : ''} ${r.live ? 'is-live' : ''}`} onClick={() => setDrawer(drawer === r.k ? null : r.k)} title={r.label} aria-label={r.label}>
            <LineIcon name={r.icon} size={18} />
            {r.badge > 0 && <span className="foc-badge">{r.badge}</span>}
            {r.dot && !r.badge && <span className="foc-dot" />}
          </button>
        ))}
        <span className="foc-rail-pct" title={`${pct}% of the course`}>{pct}%</span>
      </nav>

      <section className="foc-page">
        <div className="foc-eyebrow">{T.top} {f.mi + 1} · {chapLabel(f.chap.title)} · {idx + 1} of {flat.length}</div>
        <h1 className="foc-title">{f.topic.title}</h1>
        <div className="foc-chips">
          {media.drive ? <button className="pchip" onClick={() => { setPlaying(f.id); bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}><LineIcon name="video" size={14} /> Watch the class</button>
            : media.video ? <a className="pchip" href={media.video} target="_blank" rel="noreferrer"><LineIcon name="video" size={14} /> Watch the class</a> : null}
          {media.reading && <button className="pchip" onClick={() => viewers.setViewer({ label: media.L.reading, subtitle: f.topic.title, url: media.reading })}><LessonIcon type="pdf" size={14} /> {media.L.reading}</button>}
          {media.notes.length > 0 && <button className="pchip" onClick={() => (media.notes.length === 1 ? viewers.openNote(media.notes[0], media.L.notes) : viewers.setPicker({ title: f.topic.title, items: media.notes, label: media.L.notes }))}><LineIcon name="slides" size={14} /> {media.L.notes}{media.notes.length > 1 && ` (${media.notes.length})`}</button>}
        </div>
        <div className="foc-body" ref={bodyRef} onScroll={onScroll}><div className="foc-body-inner"><LessonBody f={f} media={media} viewers={viewers} playing={playing} setPlaying={setPlaying} /></div></div>
        <div className="foc-progress"><span style={{ transform: `scaleX(${read})` }} /></div>
        <div className="foc-foot">
          <button className="foc-prev" disabled={!prev} onClick={() => open(prev)}>← {prev ? prev.topic.title : 'Start'}</button>
          {isStudent ? (
            handoff ? (
              <button className="foc-next" onClick={() => onWork(handoff)}>{done ? '' : <span className="foc-next-mark" onClick={(e) => { e.stopPropagation(); toggle(f.id); }}>✓ Done ·</span>} Start this {T.top.toLowerCase()}’s {handoff.kind} →</button>
            ) : (
              <button className="foc-next" onClick={async () => { if (!done) await toggle(f.id); if (next) open(next); }}>
                {done ? (next ? `Next: ${next.topic.title} →` : 'Last lesson') : next ? `✓ Done · Next: ${next.topic.title} →` : '✓ Mark done'}
              </button>
            )
          ) : <button className="foc-next" disabled={!next} onClick={() => open(next)}>{next ? `Next: ${next.topic.title} →` : 'Last lesson'}</button>}
        </div>
      </section>

      {drawer === 'syllabus' && (
        <Sheet title={program.title} onClose={() => setDrawer(null)} side="left" light>
          {mods.map((m, mi) => (
            <div key={m._id} className={`foc-syl-mod is-${modState(mi)}`}>
              <div className="stk-week-head static"><span className={`stk-mark is-${modState(mi)}`}>{modState(mi) === 'done' ? <LineIcon name="check" size={13} /> : <span />}</span><span className="stk-week-title"><em>{tier(m).top} {mi + 1}</em>{m.title}</span><span className="stk-week-side">{modDone(m)}/{modLessons(m).length}</span></div>
              {(m.chapters || []).map((c) => (
                <div key={c._id}>
                  {(m.chapters.length > 1 || c.title !== 'Lessons') && !isWorkChap(c) && <div className="lchap">{chapLabel(c.title)}</div>}
                  {!isWorkChap(c) && (c.topics || []).filter((t) => !isWorkLesson(t)).map((t) => <LessonRow key={t._id} f={byId.get(String(t._id))} course={course} active={f.id === String(t._id)} onOpen={(ff) => { open(ff); setDrawer(null); }} compact showMin={false} />)}
                </div>
              ))}
            </div>
          ))}
        </Sheet>
      )}
      {drawer === 'reading' && (
        <Sheet title="Reading & notes" onClose={() => setDrawer(null)} side="left" light>
          <button className="lrow" disabled={!media.reading} onClick={() => { setDrawer(null); viewers.setViewer({ label: media.L.reading, subtitle: f.topic.title, url: media.reading }); }}><span className="lmark"><LessonIcon type="pdf" size={14} /></span><span className="lrow-title">{media.reading ? media.L.reading : media.L.noReading}</span></button>
          {media.notes.length === 0 && <div className="lrow" aria-disabled="true"><span className="lmark"><LineIcon name="slides" size={14} /></span><span className="lrow-title muted">{media.L.noNotes}</span></div>}
          {media.notes.map((n) => <button key={n.url} className="lrow" onClick={() => { setDrawer(null); viewers.openNote(n, media.L.notes); }}><span className="lmark"><LineIcon name="slides" size={14} /></span><span className="lrow-title">{n.name}</span><span className="lrow-side">{n.kind}</span></button>)}
        </Sheet>
      )}
      {drawer === 'work' && (
        <Sheet title={`Work · ${T.top.toLowerCase()} ${f.mi + 1}`} onClose={() => setDrawer(null)} side="left" light>
          {work.map((w) => <WorkRow key={w.id} w={w} onOpen={(ww) => { setDrawer(null); onWork(ww); }} />)}
          {f.mi === hereIdx && openQuizzes.map((q) => <QuizRow key={q._id} q={q} onOpen={(qq) => { setDrawer(null); setSheet({ kind: 'quiz', q: qq }); }} />)}
          {work.length === 0 && <p className="muted" style={{ padding: 12 }}>Nothing set for this {T.top.toLowerCase()}.</p>}
        </Sheet>
      )}
      {drawer === 'class' && (
        <Sheet title="Class" onClose={() => setDrawer(null)} side="left" light>
          {cls.length === 0 && <p className="muted" style={{ padding: 12 }}>No class scheduled for this {T.top.toLowerCase()} yet.</p>}
          {cls.map((s) => <ClassRow key={s._id} s={s} />)}
          {nextClass && <p className="muted" style={{ padding: '8px 12px', fontSize: 13 }}>Next: {fmtWhen(nextClass.startsAt)}</p>}
        </Sheet>
      )}
      <WorkSheet item={sheet} course={course} onClose={() => setSheet(null)} />
    </div>
  );
}
