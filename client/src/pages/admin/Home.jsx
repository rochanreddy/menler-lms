import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../../api.js';
import Empty from '../../components/Empty.jsx';

// The admin's Home: is the cohort healthy, and what needs doing today.
//
// Everything on it answers to one filter — all batches, or one. The server
// sends a block per batch (who was in each class, who handed in each piece of
// work) and this page adds up whichever blocks are in scope, so the headline
// figures and the grid under them are the same rows counted twice and cannot
// disagree.
//
// What is deliberately not here: how many mentors and quizzes exist, batches by
// status, and the at-risk list. The first three read the same every day of a
// course; the last scores students on due dates and quizzes this course does
// not use, so it named seventeen people for reasons nobody acted on. The grid
// shows the same thing — who has gone quiet — as plain facts.
const dayLabel = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });
const whenLabel = (d) => new Date(d).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
const pctOf = (n, total) => (total ? Math.round((n / total) * 100) : null);
const present = (c) => Object.values(c.marks).filter((m) => m === 'p').length;
const marked = (c) => Object.keys(c.marks).length;

/** One headline figure. `sub` is the sentence that makes the number mean something. */
function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  );
}

/** Something waiting on the admin, as a link to where it is dealt with. */
function TodayItem({ to, figure, label, detail, quiet }) {
  return (
    <Link to={to} className={`dash-today-item ${quiet ? 'is-quiet' : ''}`}>
      <span className="dash-today-figure">{figure}</span>
      <span className="dash-today-text">
        <span className="dash-today-label">{label}</span>
        {detail && <span className="dash-today-detail">{detail}</span>}
      </span>
    </Link>
  );
}

/** Attendance class by class: a column per class, its rating underneath. */
function AttendanceChart({ batch }) {
  if (batch.classes.length === 0) {
    return <Empty inline icon="webinar" title="No classes have finished yet." hint="Each class appears here once it is over." />;
  }
  return (
    <div className="chart dash-att">
      {batch.classes.map((c) => {
        const pct = pctOf(present(c), marked(c));
        return (
          <div className="bar-col" key={c.id} title={`${c.title} · ${present(c)} of ${marked(c)} present`}>
            <div className="bar-val">{pct == null ? '-' : `${pct}%`}</div>
            <div className="bar" style={{ height: `${pct || 0}%` }} />
            <div className="bar-name">
              {dayLabel(c.startsAt)}
              <span className="dash-att-sub">{present(c)}/{marked(c)}{c.rating ? ` · ★ ${c.rating}` : ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CELL = {
  p: { cls: 'is-present', glyph: '✓', word: 'Present' },
  a: { cls: 'is-absent', glyph: '×', word: 'Absent' },
  s: { cls: 'is-submitted', glyph: '✓', word: 'Handed in, awaiting review' },
  g: { cls: 'is-graded', glyph: '✓', word: 'Handed in and graded' },
};

/** One square of the grid. The glyph carries the meaning; the colour repeats it. */
function Cell({ mark, what, none }) {
  const spec = CELL[mark];
  return (
    <td>
      <span className={`dash-cell ${spec ? spec.cls : 'is-none'}`} title={`${what} · ${spec ? spec.word : none}`}>
        <span aria-hidden="true">{spec ? spec.glyph : ''}</span>
        <span className="sr-only">{spec ? spec.word : none}</span>
      </span>
    </td>
  );
}

/**
 * Students down the side, classes and handed-in work across the top.
 *
 * Work appears as a column once anyone has handed it in. The curriculum's set
 * carries no due dates, so a column for all twenty-one Kickstarter assignments
 * would be a wall of empty squares that says "missing" about work nobody has
 * been asked for yet.
 */
function EngagementGrid({ batch }) {
  const work = batch.work.filter((w) => Object.keys(w.by).length > 0);
  if (batch.students.length === 0) return <Empty inline icon="students" title="Nobody is enrolled in this batch yet." />;
  if (batch.classes.length === 0 && work.length === 0) {
    return <Empty inline icon="students" title="Nothing to show yet." hint="The grid fills in after the first class or the first hand-in." />;
  }
  return (
    <div className="dash-grid-wrap">
      <table className="dash-grid">
        <thead>
          <tr>
            <th scope="col" className="dash-grid-name">Student</th>
            {batch.classes.map((c) => <th scope="col" key={c.id} title={c.title}>{dayLabel(c.startsAt)}</th>)}
            {work.map((w, i) => <th scope="col" key={w.id} title={w.title} className={i === 0 ? 'dash-grid-split' : ''}>{w.type === 'project' ? 'P' : 'A'}{i + 1}</th>)}
            <th scope="col" className="dash-grid-split">Present</th>
          </tr>
        </thead>
        <tbody>
          {batch.students.map((s) => {
            const mine = batch.classes.map((c) => c.marks[s.id]).filter(Boolean);
            const pct = pctOf(mine.filter((m) => m === 'p').length, mine.length);
            return (
              <tr key={s.id}>
                <th scope="row" className="dash-grid-name"><Link to={`/app/students/${s.id}`}>{s.name}</Link></th>
                {batch.classes.map((c) => <Cell key={c.id} mark={c.marks[s.id]} what={`${dayLabel(c.startsAt)} · ${c.title}`} none="Not on the register" />)}
                {work.map((w) => <Cell key={w.id} mark={w.by[s.id]} what={w.title} none="Not handed in" />)}
                <td className="dash-grid-pct">{pct == null ? '-' : `${pct}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Hand-ins per piece of work: how much of the cohort, and how much is graded. */
function WorkList({ batch }) {
  const total = batch.students.length;
  const started = batch.work.filter((w) => Object.keys(w.by).length > 0);
  const untouched = batch.work.length - started.length;
  if (batch.work.length === 0) return <Empty inline icon="grades" title="No assignments in this batch yet." />;
  return (
    <div className="dash-work">
      {started.map((w) => {
        const marks = Object.values(w.by);
        const graded = marks.filter((m) => m === 'g').length;
        return (
          <div className="dash-work-row" key={w.id}>
            <div className="dash-work-title">{w.title}</div>
            <div className="dash-work-track" role="img" aria-label={`${marks.length} of ${total} handed in, ${graded} graded`}>
              <div className="dash-work-fill" style={{ width: `${pctOf(marks.length, total) || 0}%` }} />
              <div className="dash-work-fill is-graded" style={{ width: `${pctOf(graded, total) || 0}%` }} />
            </div>
            <div className="dash-work-count">{marks.length} of {total}<span className="muted"> · {graded} graded</span></div>
          </div>
        );
      })}
      {untouched > 0 && (
        <p className="muted dash-work-rest">
          {started.length === 0 ? 'Nothing has been handed in yet' : `${untouched} more with no hand-ins yet`} · {batch.work.length} pieces of work in all.
        </p>
      )}
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const QUIET_DAYS = 7;

/**
 * Who has opened the LMS lately, and who has not.
 *
 * The grid says who came to class; this says who is still coming to the
 * platform at all, which goes first. Three groups, and the two worth acting
 * on are named: a student quiet for a week is one message away from being
 * back, and an account that was never opened usually means the welcome mail
 * never arrived.
 */
function LastSeen({ batch }) {
  const now = Date.now();
  const days = (s) => Math.floor((now - new Date(s.lastActiveAt).getTime()) / DAY_MS);
  const never = batch.students.filter((s) => !s.lastActiveAt);
  const seen = batch.students.filter((s) => s.lastActiveAt);
  const quiet = seen.filter((s) => days(s) >= QUIET_DAYS).sort((x, y) => days(y) - days(x));
  const active = seen.length - quiet.length;
  if (batch.students.length === 0) return <Empty inline icon="students" title="Nobody is enrolled in this batch yet." />;

  const names = (rows, detail) => rows.map((s) => (
    <Link key={s.id} to={`/app/students/${s.id}`} className="dash-seen-name">
      {s.name}{detail && <span className="muted"> · {detail(s)}</span>}
    </Link>
  ));
  return (
    <div className="dash-seen">
      <div className="dash-seen-group">
        <div className="dash-seen-figure is-ok">{active}</div>
        <div className="dash-seen-label">Active this week</div>
        <p className="muted dash-seen-note">Opened the LMS in the last {QUIET_DAYS} days.</p>
      </div>
      <div className="dash-seen-group">
        <div className={`dash-seen-figure ${quiet.length ? 'is-warn' : ''}`}>{quiet.length}</div>
        <div className="dash-seen-label">Gone quiet</div>
        {quiet.length === 0
          ? <p className="muted dash-seen-note">Nobody has been away a week or more.</p>
          : <div className="dash-seen-names">{names(quiet, (s) => `${days(s)} days ago`)}</div>}
      </div>
      <div className="dash-seen-group">
        <div className={`dash-seen-figure ${never.length ? 'is-danger' : ''}`}>{never.length}</div>
        <div className="dash-seen-label">Never opened it</div>
        {never.length === 0
          ? <p className="muted dash-seen-note">Every enrolled student has been in at least once.</p>
          : <div className="dash-seen-names">{names(never)}</div>}
      </div>
    </div>
  );
}

export default function AdminHome() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [batchId, setBatchId] = useState(''); // '' = every batch
  useEffect(() => { api('/stats/admin-dashboard').then(setData).catch((e) => setErr(e.message)); }, []);

  const all = data?.batches || [];
  const scope = useMemo(() => (batchId ? all.filter((b) => b.id === batchId) : all), [all, batchId]);
  // A student in two batches is one person, in the count and in the filter.
  const headcount = (batches) => new Set(batches.flatMap((b) => b.students.map((s) => s.id))).size;

  const sum = useMemo(() => {
    const classes = scope.flatMap((b) => b.classes).sort((x, y) => new Date(x.startsAt) - new Date(y.startsAt));
    const handIns = scope.flatMap((b) => b.work.flatMap((w) => Object.entries(w.by)));
    const reviews = classes.reduce((n, c) => n + c.reviews, 0);
    const next = scope
      .filter((b) => b.nextClass)
      .map((b) => ({ ...b.nextClass, batch: b.name }))
      .sort((x, y) => new Date(x.startsAt) - new Date(y.startsAt))[0];
    return {
      classes,
      attendance: pctOf(classes.reduce((n, c) => n + present(c), 0), classes.reduce((n, c) => n + marked(c), 0)),
      handIns: handIns.length,
      awaiting: handIns.filter(([, mark]) => mark === 's').length,
      handedIn: new Set(handIns.map(([sid]) => sid)).size,
      reviews,
      rating: reviews ? Math.round((classes.reduce((n, c) => n + (c.rating || 0) * c.reviews, 0) / reviews) * 10) / 10 : null,
      lessons: pctOf(scope.reduce((n, b) => n + b.lessons.done, 0), scope.reduce((n, b) => n + b.lessons.total, 0)),
      doubts: scope.reduce((n, b) => n + b.unansweredDoubts, 0),
      next,
    };
  }, [scope]);

  // "Up or down on the class before" only means something inside one batch:
  // across two, consecutive classes belong to different rooms.
  const trend = useMemo(() => {
    if (scope.length !== 1) return null;
    const [prev, last] = scope[0].classes.slice(-2).map((c) => pctOf(present(c), marked(c)));
    if (prev == null || last == null) return null;
    const diff = last - prev;
    return diff === 0 ? 'Same as the class before' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} point${Math.abs(diff) === 1 ? '' : 's'} on the class before`;
  }, [scope]);

  const students = headcount(scope);
  const desk = data?.desk || {};
  const s = data?.stats || {};

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <p className="greet">Everything, at a glance.</p>
          <p>How each cohort is doing, and what is waiting on you.</p>
        </div>
        <button className="btn sm ghost" onClick={() => downloadFile('/reports/platform')}>Platform report (CSV)</button>
      </div>

      {err && <div className="blockbox">{err}</div>}

      {data && (
        <>
          <div className="dash-filter" role="group" aria-label="Batch">
            {[{ id: '', name: 'All batches', count: headcount(all) }, ...all.map((b) => ({ id: b.id, name: b.name, count: b.students.length }))].map((o) => (
              <button
                key={o.id || 'all'}
                type="button"
                className={`dash-filter-chip ${o.id === batchId ? 'on' : ''}`}
                aria-pressed={o.id === batchId}
                onClick={() => setBatchId(o.id)}
              >
                {o.name}<span className="dash-filter-count">{o.count}</span>
              </button>
            ))}
          </div>

          <div className="stats">
            <Stat
              label="Students"
              value={students}
              sub={batchId ? `enrolled in ${scope[0]?.program || 'this batch'}` : `across ${all.length} batch${all.length === 1 ? '' : 'es'}${s.students > students ? ` · ${s.students - students} not in a batch` : ''}`}
            />
            <Stat
              label="Attendance"
              value={sum.attendance == null ? '-' : `${sum.attendance}%`}
              sub={trend || `${sum.classes.length} class${sum.classes.length === 1 ? '' : 'es'} so far`}
            />
            <Stat
              label="Hand-ins"
              value={sum.handIns}
              sub={`from ${sum.handedIn} of ${students} students${sum.lessons == null ? '' : ` · ${sum.lessons}% of lessons done`}`}
            />
            <Stat
              label="Class rating"
              value={sum.rating == null ? '-' : sum.rating}
              sub={sum.reviews ? `out of 5 · ${sum.reviews} review${sum.reviews === 1 ? '' : 's'}` : 'No reviews yet'}
            />
          </div>

          {(s.blockedUsers ?? 0) > 0 && (
            <div className="blockbox" style={{ marginBottom: 'var(--space-5)' }}>
              {s.blockedUsers} account{s.blockedUsers === 1 ? ' is' : 's are'} currently blocked from the LMS.
            </div>
          )}

          <div className="panel dash-today">
            <div className="eyebrow">Today</div>
            <div className="dash-today-items">
              <TodayItem
                to="/app/batches"
                figure={sum.next ? dayLabel(sum.next.startsAt) : '-'}
                label={sum.next ? 'Next class' : 'No class scheduled'}
                detail={sum.next ? `${whenLabel(sum.next.startsAt)} · ${sum.next.batch}${sum.next.hasLink ? '' : ' · no join link yet'}` : 'Schedule one from Batches.'}
                quiet={!sum.next}
              />
              <TodayItem to="/app/batches" figure={sum.awaiting} label="Awaiting review" detail="Hand-ins not graded yet" quiet={!sum.awaiting} />
              <TodayItem to="/app/batches" figure={sum.doubts} label="Unanswered doubts" detail="Forum threads with no reply" quiet={!sum.doubts} />
              <TodayItem to="/app/support" figure={desk.openTickets ?? 0} label="Open tickets" detail="Waiting on the team" quiet={!desk.openTickets} />
              <TodayItem to="/app/mail" figure={desk.scheduledMails ?? 0} label="Mail scheduled" detail="Queued to go out" quiet={!desk.scheduledMails} />
            </div>
          </div>

          {scope.map((b) => (
            <div className="panel dash-section" key={`att-${b.id}`}>
              <div className="eyebrow">Attendance by class</div>
              <h2>{b.name}</h2>
              <AttendanceChart batch={b} />
            </div>
          ))}

          {scope.map((b) => (
            <div className="panel dash-section" key={`grid-${b.id}`}>
              <div className="eyebrow">Who is showing up</div>
              <h2>{b.name}</h2>
              <p className="muted dash-legend">
                <span className="dash-cell is-present" aria-hidden="true">✓</span> Present
                <span className="dash-cell is-absent" aria-hidden="true">×</span> Absent
                <span className="dash-cell is-graded" aria-hidden="true">✓</span> Handed in
                <span className="dash-cell is-none" aria-hidden="true" /> Nothing recorded
              </p>
              <EngagementGrid batch={b} />
            </div>
          ))}

          {scope.map((b) => (
            <div className="panel dash-section" key={`work-${b.id}`}>
              <div className="eyebrow">Hand-ins by assignment</div>
              <h2>{b.name}</h2>
              <WorkList batch={b} />
            </div>
          ))}

          {scope.map((b) => (
            <div className="panel dash-section" key={`seen-${b.id}`}>
              <div className="eyebrow">Last seen on the LMS</div>
              <h2>{b.name}</h2>
              <LastSeen batch={b} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
