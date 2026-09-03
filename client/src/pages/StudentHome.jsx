import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import Empty from '../components/Empty.jsx';
import LineIcon from '../components/LineIcon.jsx';
import { loadLearning } from '../nav.jsx';

// This device's local calendar day as absolute UTC instants, sent to
// GET /sessions/live. "Today's class" has to mean today on the STUDENT's
// clock — the server can't infer that, and its own container clock is UTC,
// so the boundary is computed here and passed along. Same getFullYear/
// getMonth/getDate semantics the old client-side isToday() check used.
function localDayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart: start.toISOString(), dayEnd: end.toISOString() };
}

// localStorage cache for the Join Live Class CTA only — lets it paint on the
// very first frame of a repeat visit instead of waiting on a round trip.
// Scoped per user so a shared device never shows one student's cached class
// to another. Only ever a rendering optimisation: see openLiveClass below for
// the rule that keeps a click from ever following a stale link.
const liveCacheKey = (uid) => `lms_live_class_${uid}`;

// undefined = no usable cache entry; null = cached "nothing on today", which
// is a real answer and shouldn't leave the CTA sitting in a loading state.
function readLiveCache(uid) {
  try {
    const raw = localStorage.getItem(liveCacheKey(uid));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    // Only trust a cache written earlier TODAY. A session cached yesterday
    // as "today's class" is simply wrong once the calendar date has rolled
    // over — the fresh fetch (already in flight) corrects it moments later,
    // but there's no reason to show a wrong label even that briefly.
    if (new Date(parsed.cachedAt).toDateString() !== new Date().toDateString()) return undefined;
    return parsed.liveClass;
  } catch {
    return undefined;
  }
}

function writeLiveCache(uid, liveClass) {
  try {
    localStorage.setItem(liveCacheKey(uid), JSON.stringify({ liveClass, cachedAt: Date.now() }));
  } catch {
    // Storage full or unavailable (private browsing) — falls back to the
    // network fetch on every visit, exactly like before this change.
  }
}

// THE PATH — the student home.
//
// Not a dashboard of tiles. The curriculum is drawn as a route: modules are
// stations along the violet rule, dots say where you are, and one card tells
// you the single next thing to do. Progress is spatial, so you SEE how far
// along you are instead of reading a percentage.
//
// The path is indicative, never gating — every station stays clickable.
// Adult learners revisit material, and locking that is hostile.
export default function StudentHome() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [program, setProgram] = useState(null);
  const [progress, setProgress] = useState({ completedTopics: [], total: 0, pct: 0 });
  // Upcoming sessions only — powers "Coming up" and the imminent-session
  // strip further down, both of which already wait on `loading` below. The
  // Join Live Class CTA no longer reads this; it has its own endpoint.
  const [sessions, setSessions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [att, setAtt] = useState({ pct: 0, present: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // The Join Live Class CTA, served whole by GET /sessions/live. Seeded from
  // the cache so it can paint on the very first render, then always
  // revalidated in the background.
  const cachedLiveClass = readLiveCache(user.id);
  const [liveClass, setLiveClass] = useState(cachedLiveClass ?? null);
  // A cached "nothing on today" is a real answer, so only a MISSING cache
  // entry leaves this in a loading state.
  const [liveClassLoading, setLiveClassLoading] = useState(cachedLiveClass === undefined);
  // Set only when the request genuinely fails (not just "nothing today") —
  // lets the CTA offer a retry instead of quietly vanishing.
  const [liveClassFailed, setLiveClassFailed] = useState(false);
  // The in-flight (or most recently settled) fetch. A click on the CTA while
  // this is still pending must resolve it first — a cached link is a
  // rendering optimisation, never the value that is actually followed.
  const liveClassPromiseRef = useRef(null);

  // One request, already narrowed server-side to the single session the CTA
  // cares about — shared by the initial load below and the retry button.
  function fetchLiveClass() {
    const { dayStart, dayEnd } = localDayBounds();
    return api(`/sessions/live?dayStart=${encodeURIComponent(dayStart)}&dayEnd=${encodeURIComponent(dayEnd)}`)
      .then((d) => ({ liveClass: d.session ? { session: d.session, today: d.today, url: d.url } : null, failed: false }))
      .catch(() => ({ liveClass: null, failed: true }));
  }

  const retryLiveClass = () => {
    setLiveClassLoading(true);
    setLiveClassFailed(false);
    const promise = fetchLiveClass();
    liveClassPromiseRef.current = promise;
    promise.then(({ liveClass: lc, failed }) => {
      liveClassPromiseRef.current = null;
      setLiveClass(lc);
      setLiveClassLoading(false);
      setLiveClassFailed(failed);
      if (!failed) writeLiveCache(user.id, lc);
    });
  };

  useEffect(() => {
    let alive = true;

    // The CTA gets its own single request so a slow
    // assignments/announcements/attendance response downstream never holds
    // the button back. Runs (and revalidates the cache) even on a cache hit,
    // since the cache is only ever a first-paint optimisation, never the
    // source of truth.
    const liveClassPromise = fetchLiveClass();
    liveClassPromiseRef.current = liveClassPromise;
    liveClassPromise.then(({ liveClass: lc, failed }) => {
      liveClassPromiseRef.current = null;
      if (!alive) return;
      setLiveClass(lc);
      setLiveClassLoading(false);
      setLiveClassFailed(failed);
      if (!failed) writeLiveCache(user.id, lc);
    });

    Promise.all([
      api('/batches').catch(() => ({ batches: [] })),
      // Only the title is read from this list (see `p` below) — the detail
      // request further down always fetches the full curriculum tree.
      api('/programs?fields=summary').catch(() => ({ programs: [] })),
      // Feeds "Coming up" and the imminent-session strip, both of which sit
      // behind `loading` anyway — not on the CTA's critical path.
      api('/sessions?scope=upcoming').catch(() => ({ sessions: [] })),
      api('/assignments?scope=mine').catch(() => ({ assignments: [] })),
      api('/announcements').catch(() => ({ announcements: [] })),
      api('/attendance/me').catch(() => ({ pct: 0, present: 0, total: 0 })),
    ]).then(async ([bd, pd, sd, ad, nd, at]) => {
      if (!alive) return;
      setSessions(sd.sessions || []);
      setAssignments(ad.assignments || []);
      setAnnouncements(nd.announcements || []);
      setAtt(at);

      const progId = (bd.batches || [])[0]?.programId;
      const p = (pd.programs || []).find((x) => x._id === progId) || (pd.programs || [])[0] || null;

      // The list usually carries the curriculum tree already; only pay for the
      // detail request when it doesn't, since the Path is built from modules.
      if (p) {
        const full = p.modules?.length ? p : await api(`/programs/${p._id}`).then((d) => d.program).catch(() => p);
        if (!alive) return;
        setProgram(full);
        api(`/progress/me?programId=${p._id}`).then((d) => alive && setProgress(d)).catch(() => {});
      }
      setLoading(false);
    });

    return () => { alive = false; };
  }, []);

  const done = useMemo(() => new Set(progress.completedTopics || []), [progress]);

  // Each module becomes a station, carrying its own completion.
  // Titles arrive as "S01 · AI Foundations" — the code is the station number and
  // the name is the label. Keep the whole string when there's no code.
  const stations = useMemo(() => (program?.modules || []).map((m, i) => {
    const topics = (m.chapters || []).flatMap((c) => c.topics || []);
    const doneCount = topics.filter((t) => done.has(t._id)).length;
    const parts = m.title.split('·').map((s) => s.trim()).filter(Boolean);
    const hasCode = parts.length > 1;
    return {
      id: m._id,
      code: hasCode ? parts[0] : String(i + 1).padStart(2, '0'),
      title: hasCode ? parts.slice(1).join(' · ') : m.title,
      topics,
      done: doneCount,
      total: topics.length,
      complete: topics.length > 0 && doneCount === topics.length,
    };
  }), [program, done]);

  // You are at the first station that isn't finished.
  const nowIndex = useMemo(() => {
    const i = stations.findIndex((s) => !s.complete && s.total > 0);
    return i === -1 ? Math.max(0, stations.length - 1) : i;
  }, [stations]);

  // The single next lesson: first incomplete topic, scanning from the start.
  const nextLesson = useMemo(() => {
    for (const s of stations) {
      for (const t of s.topics) if (!done.has(t._id)) return { topic: t, station: s };
    }
    return null;
  }, [stations, done]);

  const totalTopics = stations.reduce((n, s) => n + s.total, 0);
  const doneTopics = stations.reduce((n, s) => n + s.done, 0);
  const pct = totalTopics ? Math.round((doneTopics / totalTopics) * 100) : 0;

  // Only surface a session if it's genuinely imminent (or running).
  const live = sessions.find((s) => {
    const start = new Date(s.startsAt).getTime();
    return start - Date.now() < 3 * 60 * 60 * 1000 && start + 3 * 60 * 60 * 1000 > Date.now();
  });
  const markJoin = (id) => api(`/attendance/join/${id}`, { method: 'POST' }).catch(() => {});

  // A cached liveClass can be shown before it's confirmed fresh. Resolve
  // whatever fetch is in flight (or was last kicked off) before ever
  // actually navigating, so a click can never follow a link the admin has
  // since changed — the cache only ever decided what to paint, not where to go.
  const openLiveClass = async (e) => {
    e.preventDefault();
    let target = liveClass;
    const pending = liveClassPromiseRef.current;
    if (pending) target = (await pending).liveClass;
    if (!target?.url) return;
    // Attendance is only meaningful for the class that's actually on today —
    // watching a past one shouldn't mark you present.
    if (target.today) markJoin(target.session._id);
    window.open(target.url, '_blank', 'noopener');
  };

  const openDue = assignments
    .filter((a) => !a.mySubmission && a.dueDate)
    .sort((x, y) => new Date(x.dueDate) - new Date(y.dueDate));
  const firstName = (user.full_name || user.email).split(' ')[0];

  return (
    <div>
      <div className="path-wrap">
        {/* Above the hero, before anything else — the class is the thing a
            student is most likely to have opened this page for. Gated on its
            own one-request fetch, not the rest of the dashboard, so a slow
            assignments/announcements/attendance response never holds it back. */}
        {!liveClassLoading && liveClass && (
          <div className={`live-cta ${liveClass.today ? 'is-live' : 'is-replay'}`}>
            <span className="live-cta-mark">
              {liveClass.today ? <span className="path-live-pulse" /> : <LineIcon name="video" size={18} />}
            </span>
            <div className="live-cta-copy">
              <div className="live-cta-eyebrow">{liveClass.today ? 'Live class today' : 'No live class today'}</div>
              <div className="live-cta-title">{liveClass.session.title}</div>
              <div className="live-cta-time">
                {new Date(liveClass.session.startsAt).toLocaleString([], {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
                {liveClass.session.batchId?.name ? ` · ${liveClass.session.batchId.name.replace(/^Demo[^A-Za-z0-9]+/, '')}` : ''}
              </div>
            </div>
            {liveClass.url ? (
              <a className="btn" href={liveClass.url} target="_blank" rel="noreferrer" onClick={openLiveClass}>
                <LineIcon name="video" size={17} />
                {liveClass.today ? "Join Today's Live Class" : 'Watch Previous Live Class'}
              </a>
            ) : (
              <span className="live-cta-time" style={{ marginLeft: 'auto' }}>Link coming soon</span>
            )}
          </div>
        )}

        {!liveClassLoading && !liveClass && liveClassFailed && (
          <div className="live-cta is-replay">
            <span className="live-cta-mark"><LineIcon name="video" size={18} /></span>
            <div className="live-cta-copy">
              <div className="live-cta-eyebrow">Couldn't load your live class</div>
              <div className="live-cta-title">Check your connection and try again.</div>
            </div>
            <button type="button" className="btn" onClick={retryLiveClass}>Retry</button>
          </div>
        )}

        {loading ? (
          <>
            <div className="path-where">Loading your path…</div>
            <div className="skeleton sk-title" />
            <div className="skeleton sk-path" />
          </>
        ) : stations.length === 0 ? (
          <>
            <p className="serif-lead">Welcome, {firstName}.</p>
            <div className="panel empty-state" style={{ marginTop: 'var(--space-5)' }}>
              <p className="muted">
                {program
                  ? 'Your curriculum is still being prepared. It will appear here as a path once your mentor publishes it.'
                  : "You're not enrolled in a programme yet. Once an admin adds you to a batch, your path shows up here."}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="path-hero">
              <div className="path-lead">
                <div>
                  <div className="path-where">
                    {pct === 100 ? 'Programme complete' : `Module ${nowIndex + 1} of ${stations.length} · ${firstName}'s path`}
                  </div>
                  <h1 className="path-title">{program?.title || 'Your programme'}</h1>
                </div>
                <div className="path-figure">
                  <span className="path-figure-num">{pct}<span>%</span></span>
                  <div className="path-figure-sub">{doneTopics} of {totalTopics} lessons</div>
                </div>
              </div>

              {/* The route */}
              <div className="path" role="list">
              {stations.map((s, i) => {
                const state = s.complete ? 'done' : i === nowIndex ? 'now' : 'ahead';
                return (
                  <button
                    key={s.id}
                    role="listitem"
                    className={`path-station ${state}`}
                    onClick={() => navigate('/app/learning')}
                    onMouseEnter={loadLearning}
                    onFocus={loadLearning}
                    title={`${s.done} of ${s.total} lessons complete`}
                  >
                    <span className="path-dot" />
                    <span className="path-code">{s.code}</span>
                    <span className="path-label">{s.title}</span>
                    <span className="path-state">
                      {s.complete ? 'done' : i === nowIndex ? `${s.done}/${s.total} · you are here` : `${s.total} lesson${s.total === 1 ? '' : 's'}`}
                    </span>
                  </button>
                );
              })}
              </div>
            </div>

            {/* The one next thing */}
            {nextLesson ? (
              <div className="path-next">
                <div style={{ minWidth: 0 }}>
                  <div className="path-next-eyebrow">Next for you</div>
                  <h2 className="path-next-title">{nextLesson.topic.title}</h2>
                  <div className="path-next-meta">
                    <span>{nextLesson.station.title}</span>
                    <span className="dot ahead" />
                    <span>{nextLesson.topic.contentType || 'text'}</span>
                    <span className="dot ahead" />
                    <span>lesson {doneTopics + 1} of {totalTopics}</span>
                  </div>
                </div>
                <button className="btn" onClick={() => navigate('/app/learning')} onMouseEnter={loadLearning} onFocus={loadLearning}>Continue →</button>
              </div>
            ) : (
              <div className="path-next">
                <div>
                  <div className="path-next-eyebrow">Every lesson done</div>
                  <h2 className="path-next-title">You've finished {program?.title}.</h2>
                  <p className="path-next-meta">Claim your certificate from the Classroom.</p>
                </div>
                <button className="btn" onClick={() => navigate('/app/learning')} onMouseEnter={loadLearning} onFocus={loadLearning}>View certificate</button>
              </div>
            )}

            {/* The imminent-session strip stays for a class starting soon, but
                never for the one already sitting in the button up top. */}
            {live && live._id !== liveClass?.session._id && (
              <div className="path-live">
                <span className="path-live-pulse" />
                <div>
                  <div className="path-live-title">{live.title}</div>
                  <div className="path-live-time">
                    {new Date(live.startsAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                    {live.batchId?.name ? ` · ${live.batchId.name.replace(/^Demo[^A-Za-z0-9]+/, '')}` : ''}
                  </div>
                </div>
                {live.joinUrl
                  ? <a className="btn on-stage" href={live.joinUrl} target="_blank" rel="noreferrer" onClick={() => markJoin(live._id)}>Join now</a>
                  : <span className="path-live-time" style={{ marginLeft: 'auto' }}>Link coming soon</span>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Everything else is secondary and stays quiet. Held back with the
          rest of the dashboard rather than the CTA above. */}
      {!loading && (
      <div className="home-grid">
        <section>
          <h3 className="ruled-head">Due next</h3>
          {openDue.length === 0 ? (
            <Empty inline icon="grades" title={assignments.length > 0 ? 'All caught up.' : 'Nothing outstanding.'} hint={assignments.length > 0 ? 'Every assignment set so far has been submitted.' : undefined} />
          ) : (
            <div className="qlist">
              {openDue.slice(0, 4).map((a) => {
                const late = new Date(a.dueDate) < new Date();
                return (
                  <div className="qrow" key={a._id}>
                    <span className={`dot ${late ? 'late' : 'ahead'}`} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="qrow-title">{a.title}</div>
                      <div className="qrow-sub">
                        {late ? 'Overdue · ' : ''}
                        {new Date(a.dueDate).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <span className={`status ${late ? 'status-late' : 'status-todo'}`}>{late ? 'Overdue' : 'To do'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h3 className="ruled-head">Coming up</h3>
          {sessions.length === 0 ? (
            <Empty inline icon="webinar" title="No sessions scheduled yet." hint="Your next live class shows up here with a join link." />
          ) : (
            <div className="qlist">
              {sessions.slice(0, 4).map((s) => (
                <div className="qrow" key={s._id}>
                  <span className="dot ahead" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="qrow-title">{s.title}</div>
                    <div className="qrow-sub">
                      {new Date(s.startsAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {s.joinUrl && (
                    <a className="btn quiet sm" href={s.joinUrl} target="_blank" rel="noreferrer" onClick={() => markJoin(s._id)}>Join</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="ruled-head">Your standing</h3>
          <div className="qlist">
            <div className="qrow">
              <div style={{ flex: 1 }}><div className="qrow-title">Attendance</div><div className="qrow-sub">{att.present} of {att.total} sessions</div></div>
              <span className="figure">{att.total ? `${att.pct}%` : '-'}</span>
            </div>
            <div className="qrow">
              <div style={{ flex: 1 }}><div className="qrow-title">Assignments</div><div className="qrow-sub">submitted</div></div>
              <span className="figure">{assignments.filter((a) => a.mySubmission).length}/{assignments.length}</span>
            </div>
            <div className="qrow">
              <div style={{ flex: 1 }}><div className="qrow-title">Lessons</div><div className="qrow-sub">completed</div></div>
              <span className="figure">{doneTopics}/{totalTopics}</span>
            </div>
          </div>
        </section>

        {announcements.length > 0 && (
          <section className="home-wide">
            <h3 className="ruled-head">From your mentors</h3>
            <div className="qlist">
              {announcements.slice(0, 3).map((a) => (
                <div className="qrow" key={a._id}>
                  <span className="dot ahead" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="qrow-title">{a.title}</div>
                    {a.body && <div className="qrow-sub">{a.body}</div>}
                  </div>
                  <span className="qrow-sub">{new Date(a.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      )}
    </div>
  );
}
