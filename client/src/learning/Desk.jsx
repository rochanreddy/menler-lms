import { useState } from 'react';
import LineIcon from '../components/LineIcon.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import { Chips, LessonBody, LessonFoot, LessonRow, WorkRow, ClassRow, QuizRow, WorkSheet, pressWork, useLessonKeys } from './shared.jsx';
import { chapLabel, fmtMin } from './useCourse.js';

// 1 · The Desk. The page IS the week: lessons on the left, the lesson in
// the middle, what's due on the right. Nothing to open, nothing to drill
// into; the arrows in the header are the only navigation.
export default function Desk({ course, viewers, isStudent }) {
  const { mods, current: f, hereIdx, modState, modDone, modLessons, modMinutes, tier, workFor, classFor, openQuizzes, weekMedia, mediaFor, open, byId, pct, isWorkChap, isWorkLesson } = course;
  const [weekIdx, setWeekIdx] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [playing, setPlaying] = useState(null);
  const wi = weekIdx ?? f?.mi ?? hereIdx;
  const m = mods[wi];
  const T = tier(m);
  const media = mediaFor(f);
  const wm = weekMedia(m);
  const onWork = pressWork(course, setSheet);
  useLessonKeys(course, { enabled: !viewers.busy && !sheet, isStudent });
  const go = (d) => { const n = wi + d; if (!mods[n]) return; setWeekIdx(n); const first = modLessons(mods[n]).find((t) => !course.isDone(t)) || modLessons(mods[n])[0]; if (first) open(byId.get(String(first._id))); };
  const openIn = (ff) => { setWeekIdx(ff.mi); open(ff); };

  return (
    <div className="desk">
      <header className="desk-head">
        <button className="desk-arrow" disabled={wi === 0} onClick={() => go(-1)} aria-label="Previous week"><LineIcon name="chevron" size={16} className="flip" /></button>
        <div className="desk-head-copy"><span className="desk-eyebrow">{T.top} {wi + 1} of {mods.length}</span><h2>{m.title}</h2></div>
        <ol className="desk-dots" aria-label="Weeks">{mods.map((x, i) => <li key={x._id} className={`is-${modState(i)} ${i === wi ? 'on' : ''}`}><button onClick={() => { setWeekIdx(i); const first = modLessons(x).find((t) => !course.isDone(t)) || modLessons(x)[0]; if (first) open(byId.get(String(first._id))); }} title={x.title} /></li>)}</ol>
        <span className="desk-pct">{pct}%</span>
        <button className="desk-arrow" disabled={wi >= mods.length - 1} onClick={() => go(1)} aria-label="Next week"><LineIcon name="chevron" size={16} /></button>
      </header>

      <div className="desk-grid">
        <aside className="desk-col desk-left">
          <div className="desk-col-title">Lessons</div>
          {(m.chapters || []).map((c) => (
            <div key={c._id} className="desk-chap">
              {(m.chapters.length > 1 || c.title !== 'Lessons') && !isWorkChap(c) && <div className="lchap">{chapLabel(c.title)}</div>}
              {!isWorkChap(c) && (c.topics || []).filter((t) => !isWorkLesson(t)).map((t) => <LessonRow key={t._id} f={byId.get(String(t._id))} course={course} active={f?.id === String(t._id)} onOpen={openIn} compact />)}
            </div>
          ))}
          <div className="desk-col-title mt">Materials</div>
          <button className="lrow sm" disabled={!wm.reading} onClick={() => viewers.setViewer({ label: `${T.top} ebook`, subtitle: m.title, url: wm.reading })}><span className="lmark"><LessonIcon type="pdf" size={14} /></span><span className="lrow-title">{wm.reading ? `${T.top} ebook` : 'No ebook yet'}</span></button>
          <button className="lrow sm" disabled={!wm.notes.length} onClick={() => (wm.notes.length === 1 ? viewers.openNote(wm.notes[0], 'Teacher notes') : viewers.setPicker({ title: m.title, items: wm.notes, label: 'Teacher notes' }))}><span className="lmark"><LineIcon name="slides" size={14} /></span><span className="lrow-title">{wm.notes.length ? `Teacher notes (${wm.notes.length})` : 'No notes yet'}</span></button>
        </aside>

        <section className="desk-main">
          {f ? (
            <>
              <div className="desk-main-head">
                <span className="desk-crumb">{chapLabel(f.chap.title)}</span>
                <h1>{f.topic.title}</h1>
                <Chips f={f} media={media} viewers={viewers} done={course.isDone(f.topic)} onWatch={() => setPlaying(f.id)} tone="paper" />
              </div>
              <div className="desk-main-body"><LessonBody f={f} media={media} viewers={viewers} playing={playing} setPlaying={setPlaying} /></div>
              <LessonFoot course={course} isStudent={isStudent} onWork={onWork} tone="paper" />
            </>
          ) : <p className="muted" style={{ padding: 24 }}>Pick a lesson.</p>}
        </section>

        <aside className="desk-col desk-right">
          <div className="desk-col-title">This {T.top.toLowerCase()}</div>
          {classFor(m).map((s) => <ClassRow key={s._id} s={s} compact />)}
          {workFor(m).map((w) => <WorkRow key={w.id} w={w} onOpen={onWork} compact />)}
          {wi === hereIdx && openQuizzes.map((q) => <QuizRow key={q._id} q={q} onOpen={(qq) => setSheet({ kind: 'quiz', q: qq })} compact />)}
          {classFor(m).length + workFor(m).length === 0 && <p className="muted sm-note">Nothing due this {T.top.toLowerCase()}.</p>}
          <div className="desk-sum"><b>{modDone(m)} of {modLessons(m).length}</b> done{modMinutes(m) > 0 && <> · <b>{fmtMin(modMinutes(m))}</b> left</>}</div>
        </aside>
      </div>
      <WorkSheet item={sheet} course={course} onClose={() => setSheet(null)} />
    </div>
  );
}
