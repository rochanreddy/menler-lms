// Mentor-facing UI for the automated submission review (server: utils/aiGrade.js,
// POST /submissions/:id/ai-review).
//
// The single rule this component exists to enforce visually: THE REVIEW IS
// ADVISORY. The server never writes score/feedback/status from it, and neither
// does this panel. The only action it offers is filling the mentor's own grade
// form, which the mentor still has to submit. That is why there is no
// "accept grade" button anywhere below — the closest thing, `onApply`, is
// labelled as populating the form and nothing else.
//
// Two consequences of that rule shape the layout:
//   * Red flags are accusations, not measurements (the grader's own words), so
//     they always ship with the evidence that triggered them and are never
//     folded into a number.
//   * Students never see this. The student-facing prose the model drafts is
//     shown here as a DRAFT for the mentor to copy and edit, not as something
//     already sent.

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
// server's bandFor() thresholds so a 74% write-up and a 74% overall read alike.
const toneFor = (pct) => (pct >= 75 ? 'ok' : pct >= 50 ? 'warn' : 'danger');

/** Horizontal meter: label, weighted contribution, raw fraction, bar. */
function Meter({ label, pct, raw, weight }) {
  return (
    <div className="air-meter">
      <div className="air-meter-top">
        <span className="air-meter-label">{label}</span>
        {weight && <span className="air-meter-weight">{weight} of grade</span>}
        <span className="air-meter-val">
          {raw && <span className="air-meter-raw">{raw}</span>}
          {pct}%
        </span>
      </div>
      <div className="air-bar">
        <div className={`air-bar-fill tone-${toneFor(pct)}`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

/** The 1–5 criterion dots from the write-up stage. Five discrete steps read
 *  faster than a bar when the scale is this short. */
function Steps({ score, max }) {
  return (
    <span className="air-steps" aria-label={`${score} out of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`air-step ${i < score ? `on tone-${toneFor((score / max) * 100)}` : ''}`} />
      ))}
    </span>
  );
}

/** A stage section (write-up / screenshots) that opens to show its per-item
 *  reasoning. Collapsed by default: a mentor skimming twelve submissions wants
 *  the number, and only opens the one that looks wrong. */
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

export default function AiReview({ submission, onApply, onDone }) {
  const review = submission.aiReview;
  const ready = submission.checkStatus === 'READY';

  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const timer = useRef(null);

  // Three sequential model calls behind one synchronous request, so this can
  // sit for a minute. A spinner alone reads as hung at that length; a counter
  // reads as working.
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
      setError('Could not reach the clipboard — select the text and copy it manually.');
    }
  }

  const final = review?.final;
  const writeup = review?.writeup;
  const shots = review?.screenshots;
  // A 'running' status that survived the request means the server died
  // mid-review. Offer a re-run rather than spinning forever on stale state.
  const stale = review?.status === 'running' && !busy;
  const hasResult = review?.status === 'done' && final;

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
          Reading the write-up and screenshots, then combining the two. This
          normally takes under a minute.
        </p>
      )}

      {stale && (
        <p className="air-wait">A previous review was interrupted before it finished. Re-run it to get a result.</p>
      )}

      {error && <p className="sub-check-error">{error}</p>}
      {review?.status === 'failed' && review.error && !error && (
        <p className="sub-check-error">{review.error}</p>
      )}

      {hasResult && (
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

          {/* ── How it got there ── */}
          <div className="air-meters">
            {writeup && (
              <Meter
                label="Write-up"
                pct={writeup.percentage}
                raw={`${writeup.total_score}/${writeup.max_possible}`}
                weight={final.breakdown?.writeup?.weight}
              />
            )}
            {shots && (
              <Meter
                label="Screenshots"
                pct={shots.percentage}
                raw={`${shots.items_met}/${shots.items_total}`}
                weight={final.breakdown?.screenshots?.weight}
              />
            )}
          </div>
          {final.breakdown?.note && <p className="air-note">{final.breakdown.note}</p>}

          {/* ── Flags, before the detail. A mentor who reads nothing else must
                still see these. ── */}
          <Flags flags={[...(writeup?.red_flags || []), ...(shots?.red_flags || [])]} />

          {/* ── Per-stage reasoning ── */}
          {writeup && (
            <Stage
              title="Write-up"
              headline={`${writeup.total_score}/${writeup.max_possible}`}
              tone={toneFor(writeup.percentage)}
            >
              {writeup.summary && <p className="air-summary">{writeup.summary}</p>}
              <ul className="air-criteria">
                {writeup.criteria_scores.map((c, i) => (
                  <li key={i}>
                    <div className="air-criterion-top">
                      <span className="air-criterion">{c.criterion}</span>
                      <Steps score={c.score} max={c.max || 5} />
                    </div>
                    <p className="air-criterion-fb">{c.feedback}</p>
                  </li>
                ))}
              </ul>
            </Stage>
          )}

          {shots && (
            <Stage
              title="Screenshots"
              headline={`${shots.items_met}/${shots.items_total} met`}
              tone={toneFor(shots.percentage)}
            >
              {shots.summary && <p className="air-summary">{shots.summary}</p>}
              <p className="air-note">{shots.screenshots_reviewed} screenshot(s) reviewed.</p>
              <ul className="air-check">
                {shots.checklist_results.map((c, i) => (
                  <li key={i} className={c.met ? 'is-met' : ''}>
                    <span className="air-check-mark" aria-hidden="true">{c.met ? '✓' : '✕'}</span>
                    <div>
                      <span className="air-check-item">{c.item}</span>
                      <p className="air-criterion-fb">{c.evidence}</p>
                    </div>
                  </li>
                ))}
              </ul>
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

          {/* Anything the content collector had to skip. Reported, never
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
