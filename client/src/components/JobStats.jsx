import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

// The job board's figures: what the pipeline has collected in all, what is
// live, what arrived in the last run, and how much of it made this board.
// On the Jobs page for everyone, and on the admin dashboard.
//
// The lifetime total is the headline because it is the number nothing else
// on the page can show: the board is 750, the live feed tens of thousands,
// and behind both every posting collected since the pipeline began.

const nf = new Intl.NumberFormat('en-IN');
const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts up to `target` once, when the figure first arrives. Skipped for
 * anyone who has asked for less motion, and it never animates a change after
 * the first: a number that re-runs every time it updates reads as unsure.
 */
function useCountUp(target, ms = 900) {
  const [shown, setShown] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    if (done.current || reducedMotion()) {
      setShown(target);
      return undefined;
    }
    done.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return shown;
}

/**
 * "today", "yesterday", or the date, for when the last run was. By calendar
 * day, not by 24-hour span: at 3 am, yesterday's 6 am run is under a day old
 * but it is not this morning's.
 */
function whenRan(value) {
  if (!value) return '';
  const then = new Date(value);
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(then)) / 86400000);
  if (days <= 0) return 'in today’s run';
  if (days === 1) return 'in yesterday’s run';
  return `in the run on ${day.format(then)}`;
}

function Figure({ label, value, note, lead = false }) {
  const shown = useCountUp(value);
  return (
    <div className={`jstat ${lead ? 'is-lead' : ''}`}>
      <div className="jstat-label">{label}</div>
      <div className="jstat-value" aria-label={nf.format(value)}>
        {nf.format(shown)}
      </div>
      {note && <div className="jstat-note">{note}</div>}
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} [props.isAdmin]   labels the board "On the board" rather than "Picked for you"
 * @param {boolean} [props.withLink]  adds an "Open the job board" link, for the admin dashboard
 */
export default function JobStats({ isAdmin = false, withLink = false }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let live = true;
    api('/jobs/stats')
      .then((s) => live && setStats(s))
      .catch(() => live && setStats({ feedAvailable: false }));
    return () => { live = false; };
  }, []);

  // The board says why it is thin when the feed is down; four zeroes here
  // would only repeat that, worse.
  if (stats && !stats.feedAvailable) return null;

  if (!stats) {
    return (
      <div className="jstats" aria-busy="true" aria-label="Loading job figures">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`jstat is-loading ${i === 0 ? 'is-lead' : ''}`} />)}
      </div>
    );
  }

  return (
    <section className="jstats-wrap" aria-label="Job board figures">
      {withLink && (
        <div className="jstats-head">
          <div className="eyebrow">Job board</div>
          <Link className="jstats-link" to="/app/jobs">Open the job board <span aria-hidden="true">→</span></Link>
        </div>
      )}
      <div className="jstats">
        <Figure
          lead
          label="Jobs collected"
          value={stats.collected}
          note={stats.since ? `since ${day.format(new Date(stats.since))}, every source` : 'all time, every source'}
        />
        <Figure label="Live right now" value={stats.live} note="posted in the last 10 days" />
        <Figure label="New" value={stats.newLastRun} note={whenRan(stats.lastRunAt)} />
        <Figure
          label={isAdmin ? 'On the board' : 'Picked for you'}
          value={stats.onBoard}
          note={stats.companies ? `from ${nf.format(stats.companies)} companies` : 'the best fit for Menler'}
        />
      </div>
    </section>
  );
}
