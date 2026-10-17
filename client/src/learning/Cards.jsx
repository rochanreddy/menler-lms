import { useEffect, useRef, useState } from 'react';
import LineIcon from '../components/LineIcon.jsx';
import LessonIcon from '../components/LessonIcon.jsx';
import { DrivePlayer } from '../components/Classroom.jsx';
import { Chips, LessonBody, LessonFoot, LessonRow, WorkRow, ClassRow, QuizRow, Sheet, WorkSheet, pressWork, useLessonKeys } from './shared.jsx';
import { driveEmbedUrl } from '../features.js';
import { chapLabel, fmtMin, classState } from './useCourse.js';

// 3 · The Session Card. One class = one card, side by side like a playlist.
// The recording is the hero; the lessons are a checklist under it; the
// work sits at the foot. Reading a lesson opens a sheet over the card.
export default function Cards({ course, viewers, isStudent }) {
  const { mods, current: f, hereIdx, modState, modDone, modLessons, modMinutes, tier, workFor, classFor, openQuizzes, weekMedia, mediaFor, open, byId, pct, isWorkChap, isWorkLesson, program } = course;
  const [on, setOn] = useState(hereIdx);
  const [reading, setReading] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [playing, setPlaying] = useState(null);
  const rowRef = useRef(null);
  const onWork = pressWork(course, setSheet);
  const media = mediaFor(f);
  const Wc = tier(mods[0]).top;
  useLessonKeys(course, { enabled: reading && !viewers.busy && !sheet, isStudent });
  useEffect(() => { const el = rowRef.current?.children[on]; el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [on]);
  const openLesson = (ff) => { open(ff); setReading(true); setOn(ff.mi); };

  // The card's hero: the recording of its class, else the lesson's Drive
  // video, else the week's ebook as a cover.
  const hero = (m) => {
    const past = classFor(m).find((s) => classState(s) === 'past' && s.recordingUrl);
    if (past) return { kind: driveEmbedUrl(past.recordingUrl) ? 'drive' : 'link', url: past.recordingUrl, title: past.title };
    const withVideo = modLessons(m).find((t) => t.classLink || (t.contentType === 'video' && t.contentUrl));
    if (withVideo) { const u = withVideo.classLink || withVideo.contentUrl; return { kind: driveEmbedUrl(u) ? 'drive' : 'link', url: u, title: withVideo.title }; }
    const ahead = classFor(m).find((s) => classState(s) !== 'past');
    if (ahead) return { kind: 'ahead', s: ahead };
    return { kind: 'none' };
  };

  return (
    <div className="crd">
      <div className="crd-top"><b>{program.title}</b><span>{on + 1} of {mods.length} · {pct}%</span></div>
      <div className="crd-row" ref={rowRef}>
        {mods.map((m, mi) => {
          const st = modState(mi); const T = tier(m); const h = hero(m); const wm = weekMedia(m); const isOn = mi === on;
          return (
            <article key={m._id} className={`crd-card is-${st} ${isOn ? 'on' : ''}`} onClick={() => { if (!isOn) setOn(mi); }}>
              <div className="crd-eyebrow">{T.top} {mi + 1}{st === 'done' && <span className="crd-done"><LineIcon name="check" size={12} /> done</span>}</div>
              <h2 className="crd-title">{m.title}</h2>
              <div className="crd-hero">
                {h.kind === 'drive' && <DrivePlayer link={h.url} title={h.title} on={isOn && playing === `card-${mi}`} onPlay={() => { setOn(mi); setPlaying(`card-${mi}`); }} />}
                {h.kind === 'link' && <a className="crd-hero-link" href={h.url} target="_blank" rel="noreferrer"><span className="dplay-big"><LineIcon name="play" size={26} /></span><span>Class recording · opens in a new tab</span></a>}
                {h.kind === 'ahead' && <div className="crd-hero-ahead"><LineIcon name="clock" size={22} /><b>Class {classState(h.s) === 'live' ? 'is on now' : new Date(h.s.startsAt).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</b>{classState(h.s) === 'live' && h.s.joinUrl && <a className="btn sm" href={h.s.joinUrl} target="_blank" rel="noreferrer">Join</a>}</div>}
                {h.kind === 'none' && <div className="crd-hero-ahead"><LineIcon name="video" size={22} /><b>No recording yet</b></div>}
              </div>
              <div className="pchips">
                <button className="pchip" disabled={!wm.reading} onClick={() => viewers.setViewer({ label: `${T.top} ebook`, subtitle: m.title, url: wm.reading })}><LessonIcon type="pdf" size={14} /> {wm.reading ? `${T.top} ebook` : 'No ebook yet'}</button>
                <button className="pchip" disabled={!wm.notes.length} onClick={() => (wm.notes.length === 1 ? viewers.openNote(wm.notes[0], 'Teacher notes') : viewers.setPicker({ title: m.title, items: wm.notes, label: 'Teacher notes' }))}><LineIcon name="slides" size={14} /> {wm.notes.length ? `Notes (${wm.notes.length})` : 'No notes yet'}</button>
              </div>
              <div className="crd-list">
                {(m.chapters || []).map((c) => (
                  <div key={c._id}>
                    {(m.chapters.length > 1 || c.title !== 'Lessons') && !isWorkChap(c) && <div className="lchap">{chapLabel(c.title)}</div>}
                    {!isWorkChap(c) && (c.topics || []).filter((t) => !isWorkLesson(t)).map((t) => <LessonRow key={t._id} f={byId.get(String(t._id))} course={course} active={reading && f?.id === String(t._id)} onOpen={openLesson} compact />)}
                  </div>
                ))}
              </div>
              {(workFor(m).length > 0 || (mi === hereIdx && openQuizzes.length > 0)) && (
                <div className="crd-work">
                  {workFor(m).map((w) => <WorkRow key={w.id} w={w} onOpen={onWork} compact />)}
                  {mi === hereIdx && openQuizzes.map((q) => <QuizRow key={q._id} q={q} onOpen={(qq) => setSheet({ kind: 'quiz', q: qq })} compact />)}
                </div>
              )}
              {classFor(m).filter((s) => classState(s) !== 'past').map((s) => <ClassRow key={s._id} s={s} compact />)}
              <div className="crd-foot">{modDone(m)} of {modLessons(m).length} done{modMinutes(m) > 0 && ` · ${fmtMin(modMinutes(m))} left`}</div>
            </article>
          );
        })}
      </div>
      <div className="crd-nav">
        <button className="desk-arrow" disabled={on === 0} onClick={() => setOn(on - 1)} aria-label="Previous"><LineIcon name="chevron" size={16} className="flip" /></button>
        <ol className="desk-dots">{mods.map((m, i) => <li key={m._id} className={`is-${modState(i)} ${i === on ? 'on' : ''}`}><button onClick={() => setOn(i)} title={m.title} /></li>)}</ol>
        <button className="desk-arrow" disabled={on >= mods.length - 1} onClick={() => setOn(on + 1)} aria-label="Next"><LineIcon name="chevron" size={16} /></button>
      </div>

      {reading && f && (
        <Sheet title={`${Wc} ${f.mi + 1} · ${chapLabel(f.chap.title)}`} onClose={() => setReading(false)}>
          <div className="lsheet-lesson">
            <h1 className="reader-title">{f.topic.title}</h1>
            <Chips f={f} media={media} viewers={viewers} done={course.isDone(f.topic)} onWatch={() => setPlaying(f.id)} />
            <div className="lsheet-lesson-body"><LessonBody f={f} media={media} viewers={viewers} playing={playing} setPlaying={setPlaying} /></div>
            <LessonFoot course={course} isStudent={isStudent} onWork={(w) => { setReading(false); onWork(w); }} />
          </div>
        </Sheet>
      )}
      <WorkSheet item={sheet} course={course} onClose={() => setSheet(null)} />
    </div>
  );
}
