import { useEffect, useRef, useState } from 'react';
import LineIcon from '../components/LineIcon.jsx';
import { Chips, LessonBody, LessonFoot, LessonRow, WorkRow, ClassRow, QuizRow, WorkSheet, pressWork, useLessonKeys } from './shared.jsx';
import { chapLabel, fmtMin, fmtWhen } from './useCourse.js';

// 2 · The Stack. The course as one long page: a band per week, the current
// one open, the past folded to a line, the future dimmed. The lesson opens
// INLINE under its row, so you never lose where you are in the course.
export default function Stack({ course, viewers, isStudent }) {
  const { mods, current: f, hereIdx, modState, modDone, modLessons, modMinutes, tier, workFor, classFor, openQuizzes, mediaFor, open, byId, pct, isWorkChap, isWorkLesson, program } = course;
  const [expanded, setExpanded] = useState(() => new Set([hereIdx]));
  const [sheet, setSheet] = useState(null);
  const [playing, setPlaying] = useState(null);
  const onWork = pressWork(course, setSheet);
  const media = mediaFor(f);
  const Wc = tier(mods[0]).top;
  useLessonKeys(course, { enabled: !viewers.busy && !sheet, isStudent });
  useEffect(() => { setExpanded((s) => new Set([...s, hereIdx])); }, [hereIdx]);
  // Opening a lesson unfolds its week and brings it into view.
  const openRef = useRef(null);
  const openHere = (ff) => { setExpanded((s) => new Set([...s, ff.mi])); open(ff); };
  useEffect(() => { openRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [f?.id]);
  const toggleWeek = (i) => setExpanded((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div className="stk">
      <div className="stk-bar">
        <b>{program.title}</b>
        <ol className="stk-dots">{mods.map((m, i) => <li key={m._id} className={`is-${modState(i)}`}><button onClick={() => { setExpanded((s) => new Set([...s, i])); document.getElementById(`stk-${i}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>{Wc[0]}{i + 1}</button></li>)}</ol>
        <span className="stk-pct">{pct}%</span>
      </div>

      {mods.map((m, mi) => {
        const st = modState(mi); const isOpen = expanded.has(mi); const T = tier(m);
        const cls = classFor(m); const nextClass = cls.find((s) => new Date(s.startsAt) > Date.now());
        return (
          <section key={m._id} id={`stk-${mi}`} className={`stk-week is-${st} ${isOpen ? 'open' : ''}`}>
            <button type="button" className="stk-week-head" onClick={() => toggleWeek(mi)} aria-expanded={isOpen}>
              <span className={`stk-mark is-${st}`}>{st === 'done' ? <LineIcon name="check" size={13} /> : <span />}</span>
              <span className="stk-week-title"><em>{T.top} {mi + 1}</em>{m.title}</span>
              <span className="stk-week-side">{modDone(m)}/{modLessons(m).length}{st === 'done' ? ' · done' : nextClass ? ` · class ${fmtWhen(nextClass.startsAt)}` : modMinutes(m) ? ` · ${fmtMin(modMinutes(m))}` : ''}</span>
              <span className={`rmod-caret ${isOpen ? 'up' : ''}`}>⌄</span>
            </button>
            {isOpen && (
              <div className="stk-week-body">
                {(m.chapters || []).map((c) => (
                  <div key={c._id}>
                    {(m.chapters.length > 1 || c.title !== 'Lessons') && !isWorkChap(c) && <div className="lchap">{chapLabel(c.title)}</div>}
                    {!isWorkChap(c) && (c.topics || []).filter((t) => !isWorkLesson(t)).map((t) => {
                      const ff = byId.get(String(t._id)); const active = f?.id === ff.id;
                      return (
                        <div key={t._id} ref={active ? openRef : null}>
                          <LessonRow f={ff} course={course} active={active} onOpen={openHere} />
                          {active && (
                            <div className="stk-lesson">
                              <Chips f={ff} media={media} viewers={viewers} done={course.isDone(t)} onWatch={() => setPlaying(ff.id)} tone="paper" />
                              <div className="stk-lesson-body"><LessonBody f={ff} media={media} viewers={viewers} playing={playing} setPlaying={setPlaying} /></div>
                              <LessonFoot course={course} isStudent={isStudent} onWork={onWork} tone="paper" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {(workFor(m).length > 0 || cls.length > 0) && <div className="lchap">Due this {T.top.toLowerCase()}</div>}
                {workFor(m).map((w) => <WorkRow key={w.id} w={w} onOpen={onWork} />)}
                {cls.map((s) => <ClassRow key={s._id} s={s} />)}
                {mi === hereIdx && openQuizzes.map((q) => <QuizRow key={q._id} q={q} onOpen={(qq) => setSheet({ kind: 'quiz', q: qq })} />)}
              </div>
            )}
          </section>
        );
      })}
      <WorkSheet item={sheet} course={course} onClose={() => setSheet(null)} />
    </div>
  );
}
