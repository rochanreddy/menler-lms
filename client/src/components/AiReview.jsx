// Mentor-facing UI for the automated submission review (server: utils/aiGrade.js
// scored against utils/rubric.js, POST /submissions/:id/ai-review).
//
// The single rule this component exists to enforce visually: THE REVIEW IS
// ADVISORY. The server never writes score/feedback/status from it, and neither
// does this panel. The only action it offers is filling the mentor's own grade
// form, which the mentor still has to submit. That is why there is no
// "accept grade" button anywhere below — the closest thing, `onApply`, is
// labelled as populating the form and nothing else.
//
// Three consequences of that rule shape the layout:
//   * Red flags are accusations, not measurements (the grader's own words), so
//     they always ship with the evidence that triggered them and are never
//     folded into a number.
//   * Students never see this. The student-facing prose the model drafts is
//     shown here as a DRAFT for the mentor to copy and edit, not as something
//     already sent.
//   * Anything the review could NOT read — a video, an unreadable file, a
//     criterion left out of the score — is said out loud, because the mentor is
//     the one who has to cover that gap.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import LineIcon from './LineIcon.jsx';

// The three bands the server derives from the weighted score. Wording is the
// mentor's, not the student's — "FAIL" is fine to show a mentor.
const BANDS = {
  PASS: { label: 'Pass', tone: 'ok' },
  NEEDS_REVISION: { label: 'Needs revision', tone: 'warn' },
  FAIL: { label: 'Fail', tone: 'danger' },
};

// A percentage → the same three tones, for the component meters. Matches the
// server's bandFor() thresholds so a 74% criterion and a 74% overall read alike.
const toneFor = (pct) => (pct >= 75 ? 'ok' : pct >= 50 ? 'warn' : 'danger');

/** The 1–5 criterion dots. Five discrete steps read faster than a bar when the
 *  scale is this short. */
function Steps({ score, max }) {
  return (
    <span className="air-steps" aria-label={`${score} out of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`air-step ${i < score ? `on tone-${toneFor((score / max) * 100)}` : ''}`} />
      ))}
    </span>
  );
}

/** A section that opens to show its detail. Collapsed by default: a mentor
 *  skimming twelve submissions wants the number, and only opens the one that
 *  looks wrong. */
function Stage({ title, headline, tone, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`air-stage ${open ? 'is-open' : ''}`}>
      <button type="button" className="air-stage-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`air-caret ${open ? 'up' : ''}`} aria-hidden="true">›</span>
        <span className="air-stage-title">{title}</span>
        <span className={`air-stage-score tone-${tone}`}>{headline}</span>
      </button>
      {open && <div className="air-stage-body">{children}</div>}
    </div>
  );
}

/** Red flags. Deliberately loud and always paired with their evidence — a flag
 *  without the quote that caused it is unactionable, and the mentor is the one
 *  who decides whether it means anything. */
function Flags({ flags }) {
  if (!flags?.length) return null;
  return (
    <ul className="air-flags">
      {flags.map((f, i) => (
        <li key={i}>
          <span className="air-flag-name"><LineIcon name="alert" size={13} />{f.flag}</span>
          <span className="air-flag-ev">{f.evidence}</span>
        </li>
      ))}
    </ul>
  );
}

/** A block of model-written prose with a copy button. */
function Prose({ kicker, text, note, onCopy, copied }) {
  if (!text) return null;
  return (
    <div className="air-prose">
      <div className="air-prose-top">
        <span className="air-kicker">{kicker}</span>
        {onCopy && (
          <button type="button" className="linklike air-copy" onClick={onCopy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <p>{text}</p>
      {note && <p className="air-prose-note">{note}</p>}
    </div>
  );
}

/** One rubric criterion: its score, its weight, and the sentence behind it.
 *  The weight is on screen because it is the answer to "why did a 3 here cost
 *  so much more than a 3 there", which is the first question a mentor asks.
 *
 *  A CREDITED row is one our own tooling could not assess, so it was given the
 *  benefit of the doubt rather than marked down. It has to be unmissable: the
 *  student was not penalised for our outage, and the mentor is the only one who
 *  can now actually judge it. That is why it is labelled rather than quietly
 *  scored. */
function Criterion({ c }) {
  return (
    <li className={c.credited ? 'is-credited' : ''}>
      <div className="air-criterion-top">
        <span className="air-criterion">
          <span className="air-criterion-key">{c.key}</span>
          {c.label}
        </span>
        <span className="air-criterion-weight">
          {c.credited ? 'credited, not assessed' : `${c.weight}%`}
        </span>
        <Steps score={c.score} max={c.max || 5} />
      </div>
      <p className="air-criterion-fb">{c.feedback}</p>
    </li>
  );
}

/** The link check. Three outcomes and they mean very different things, so they
 *  are coloured differently: a dead link is a finding about the student's work,
 *  and "could not be checked" is a fact about our server that must never be
 *  read as one. LinkedIn and Notion refuse robots on pages that work fine. */
function Links({ links }) {
  if (!links?.length) return null;
  const tone = (s) => (s === 'live' ? 'ok' : s === 'dead' ? 'danger' : 'muted');
  return (
    <ul className="air-links">
      {links.map((l, i) => (
        <li key={i} className={`tone-${tone(l.status)}`}>
          <span className="air-link-status">{l.status}</span>
          <span className="air-link-url">
            {/^https?:\/\//.test(l.url)
              ? <a href={l.url} target="_blank" rel="noreferrer noopener">{l.url}</a>
              : l.url}
          </span>
          <span className="air-link-note">{l.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/** What the review actually read, and what it did not. The mentor's cue for
 *  where their own eyes are still required — the video above all. */
function Evidence({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="air-evidence">
      {items.map((it) => (
        <li key={it.n} className={it.kind === 'video' ? 'is-video' : it.unreadable ? 'is-unread' : ''}>
          <span className="air-ev-n">{it.n}</span>
          <span className="air-ev-kind">{it.kind}</span>
          <span className="air-ev-name">{it.name}</span>
          <span className="air-ev-note">
            {it.kind === 'video' ? 'not reviewed, please watch it' : it.unreadable || it.meta || 'read'}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Reviews stored before the rubric landed ─────────────────────────────────
// The old pipeline wrote { writeup, screenshots, final:{weighted_score,…} }.
// Those rows are still in the database and a mentor opening one should see the
// grade they were given, not an empty panel, so the old shape is detected and
// rendered read-only rather than migrated.
const isLegacy = (review) => !!(review?.final && !review.final.criteria && (review.writeup || review.screenshots));

function LegacyResult({ review }) {
  const { final, writeup, screenshots } = review;
  return (
    <>
      <div className={`air-verdict tone-${BANDS[final.result]?.tone || 'warn'}`}>
        <div className="air-figure">
          <span className="air-figure-num">{final.weighted_score}</span>
          <span className="air-figure-den">/{final.max_score}</span>
        </div>
        <div className="air-verdict-copy">
          <span className={`air-band tone-${BANDS[final.result]?.tone || 'warn'}`}>
            {BANDS[final.result]?.label || final.result}
          </span>
          <span className="air-suggest">Suggested grade {final.suggested_grade}</span>
        </div>
      </div>
      <p className="air-note">
        This review was run under the previous two-part rubric, before the six criteria.
        Re-run it for a result on the current rubric.
      </p>
      <Flags flags={[...(writeup?.red_flags || []), ...(screenshots?.red_flags || [])]} />
      <Prose kicker="For you" text={final.mentor_notes} />
      <Prose kicker="Draft feedback for the student" text={final.student_feedback} note="Not sent." />
    </>
  );
}

export default function AiReview({ submission, onApply, onDone }) {
  const review = submission.aiReview;
  const ready = submission.checkStatus === 'READY';

  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const timer = useRef(null);

  // Up to three sequential model calls behind one synchronous request, so this
  // can sit for a minute. A spinner alone reads as hung at that length; a
  // counter reads as working.
  useEffect(() => {
    if (!busy) { clearInterval(timer.current); return undefined; }
    setElapsed(0);
    timer.current = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(timer.current);
  }, [busy]);

  async function run() {
    setBusy(true);
    setError('');
    try {
      await api(`/submissions/${submission._id}/ai-review`, { method: 'POST' });
      onDone?.();
    } catch (err) {
      setError(err.message);
      onDone?.(); // the server records the failure on the submission — reload to show it
    } finally {
      setBusy(false);
    }
  }

  // navigator.clipboard is undefined on plain-http origins, which is exactly
  // what a mentor testing against a LAN address hits — so this must degrade
  // rather than throw.
  async function copy(key, text) {
    try {
      if (!navigator.clipboard) throw new Error('unavailable');
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setError('Could not reach the clipboard. Select the text and copy it manually.');
    }
  }

  const final = review?.final;
  const legacy = isLegacy(review);
  // A 'running' status that survived the request means the server died
  // mid-review. Offer a re-run rather than spinning forever on stale state.
  const stale = review?.status === 'running' && !busy;
  const hasResult = review?.status === 'done' && final;
  const checklist = final?.deliverables_check || [];
  const met = checklist.filter((d) => d.present).length;

  return (
    <section className="air">
      <div className="air-head">
        <span className="air-title">
          <LineIcon name="check" size={14} />
          AI review
        </span>
        {/* The framing, stated once and always visible — not buried in a
            tooltip. Everything in this panel is a second opinion. */}
        <span className="badge badge-muted">advisory</span>
        {hasResult && !legacy && final.rubric_class && (
          <span className="air-model">Rubric {final.rubric_class} · {final.rubric_class_name}</span>
        )}
        {review?.model && hasResult && <span className="air-model">{review.model}</span>}
        <span className="spacer" />
        {!ready ? (
          <span className="air-blocked">Drive check must pass first</span>
        ) : (
          <button
            type="button"
            className={`btn sm ${hasResult || stale ? 'quiet' : 'ghost'} ${busy ? 'is-busy' : ''}`}
            onClick={run}
            disabled={busy}
          >
            {busy ? `Reviewing… ${elapsed}s` : hasResult || stale ? 'Re-run' : 'Run AI review'}
          </button>
        )}
      </div>

      {busy && (
        <p className="air-wait">
          Reading the documents, artifacts and screenshots, checking every link, then
          scoring it all against the rubric. Video is left for you. This normally
          takes under a minute.
        </p>
      )}

      {stale && (
        <p className="air-wait">A previous review was interrupted before it finished. Re-run it to get a result.</p>
      )}

      {error && <p className="sub-check-error">{error}</p>}
      {review?.status === 'failed' && review.error && !error && (
        <p className="sub-check-error">{review.error}</p>
      )}

      {hasResult && legacy && <LegacyResult review={review} />}

      {hasResult && !legacy && (
        <>
          {/* ── The verdict ── */}
          <div className={`air-verdict tone-${BANDS[final.result]?.tone || 'warn'}`}>
            <div className="air-figure">
              <span className="air-figure-num">{final.weighted_score}</span>
              <span className="air-figure-den">/{final.max_score}</span>
            </div>
            <div className="air-verdict-copy">
              <span className={`air-band tone-${BANDS[final.result]?.tone || 'warn'}`}>
                {BANDS[final.result]?.label || final.result}
              </span>
              <span className="air-suggest">Suggested grade {final.suggested_grade}</span>
            </div>
            {onApply && (
              // The bridge from advisory to actual: it fills the mentor's form
              // and stops. Saying so on the button is the whole point.
              <button
                type="button"
                className="btn sm"
                onClick={() => onApply({
                  score: Math.min(10, Math.max(1, Math.round(final.weighted_score / 10))),
                  feedback: final.student_feedback || '',
                })}
              >
                Fill grade form
              </button>
            )}
          </div>

          {/* ── Flags, before the detail. A mentor who reads nothing else must
                still see these. ── */}
          <Flags flags={final.red_flags} />

          {/* ── The six criteria. This IS the grade, so it is not collapsed. ── */}
          <ul className="air-criteria">
            {final.criteria.map((c) => <Criterion key={c.key} c={c} />)}
          </ul>

          {/* ── The checklist C1 was scored against. Separate from the criteria
                because it is the one part a student can act on line by line. ── */}
          {checklist.length > 0 && (
            <Stage
              title="Deliverables"
              headline={`${met}/${checklist.length} present`}
              tone={toneFor((met / checklist.length) * 100)}
              defaultOpen={met < checklist.length}
            >
              <ul className="air-check">
                {checklist.map((d, i) => (
                  <li key={i} className={d.present ? 'is-met' : ''}>
                    <span className="air-check-mark" aria-hidden="true">{d.present ? '✓' : '✕'}</span>
                    <div>
                      <span className="air-check-item">{d.deliverable}</span>
                      <p className="air-criterion-fb">{d.evidence}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Stage>
          )}

          {/* ── What was actually read. Where the video is named. ── */}
          {final.evidence?.length > 0 && (
            <Stage title="What was reviewed" headline={`${final.evidence.length} file(s)`} tone="ok">
              {final.summary && <p className="air-summary">{final.summary}</p>}
              <Evidence items={final.evidence} />
            </Stage>
          )}

          {/* ── Links. Its own section because a dead link is often the single
                most actionable thing on this screen: a capstone whose public
                URL 404s has failed its main deliverable, and nobody would
                notice it from the prose alone. ── */}
          {final.links?.length > 0 && (
            <Stage
              title="Links"
              headline={
                final.links.some((l) => l.status === 'dead')
                  ? `${final.links.filter((l) => l.status === 'dead').length} dead`
                  : `${final.links.length} checked`
              }
              tone={final.links.some((l) => l.status === 'dead') ? 'danger' : 'ok'}
              defaultOpen={final.links.some((l) => l.status === 'dead')}
            >
              <Links links={final.links} />
            </Stage>
          )}

          {/* ── The prose. Mentor's note first: it's the one written for the
                person actually reading this screen. ── */}
          <Prose kicker="For you" text={final.mentor_notes} />
          <Prose
            kicker="Draft feedback for the student"
            text={final.student_feedback}
            note="Not sent. Copy it into the feedback field below, or edit it first."
            onCopy={() => copy('student', final.student_feedback)}
            copied={copied === 'student'}
          />

          {/* Anything skipped, dropped or left for the mentor. Reported, never
              silent — the grade was computed on less than the whole folder. */}
          {final.notes?.length > 0 && (
            <ul className="air-caveats">
              {final.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}

          {review.reviewedAt && (
            <p className="air-stamp">Reviewed {new Date(review.reviewedAt).toLocaleString()}</p>
          )}
        </>
      )}
    </section>
  );
}
