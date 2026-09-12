import { useEffect, useState } from 'react';
import { api } from '../api.js';

// The review a student owes for the last class, asked before anything else.
//
// It covers the whole app rather than sitting on Home: feedback gathered "when
// they get round to it" is feedback from the few who do, and the point of
// asking every student is a complete picture of how the class landed. Escape
// closes nothing and there is no dismiss — the only way out is to answer.
//
// Four scores rather than one, because they fail apart: a class can be
// enjoyable and still teach nobody anything, and that gap is the signal worth
// having. The scale is stated once, at the top — a bare row of stars leaves
// half a cohort guessing which end is good.
const QUESTIONS = [
  ['overall', 'How would you rate today’s session?'],
  ['useful', 'How useful was the session for you?'],
  ['understanding', 'How well did you understand what was taught?'],
  ['instructor', 'How would you rate the instructor and session experience?'],
];
const WORDS = ['', 'Poor', 'Not great', 'Fine', 'Good', 'Excellent'];

function StarRow({ id, value, onPick }) {
  return (
    <div className="review-stars" role="radiogroup" aria-labelledby={id}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`review-star ${value >= n ? 'on' : ''}`}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of 5`}
          onClick={() => onPick(n)}
        >★</button>
      ))}
      <span className="muted review-star-word">{WORDS[value] || ''}</span>
    </div>
  );
}

export default function ClassReviewGate({ pending, onDone }) {
  const { session, remaining } = pending;
  const [scores, setScores] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Nothing behind the gate should scroll while it is up.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // A fresh, empty form for the next class in the queue.
  useEffect(() => { setScores({}); setComment(''); setErr(''); }, [session._id]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const missing = QUESTIONS.find(([key]) => !scores[key]);
    if (missing) { setErr('Please answer all four ratings.'); return; }
    setErr(''); setBusy(true);
    try {
      const r = await api(`/reviews/${session._id}`, { method: 'POST', body: { ...scores, comment } });
      onDone(r.remaining || 0);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  const when = new Date(session.startsAt).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="review-gate" role="dialog" aria-modal="true" aria-labelledby="review-gate-title">
      <form className="review-card" onSubmit={submit}>
        <div className="eyebrow">Before you continue</div>
        <h2 id="review-gate-title" className="h-flush">How was the class?</h2>
        <p className="muted review-gate-sub">
          <strong>{session.title}</strong><br />{when}{session.batch ? ` · ${session.batch}` : ''}
        </p>
        <p className="muted review-scale">Rate each from <strong>1 (low)</strong> to <strong>5 (high)</strong>.</p>

        {QUESTIONS.map(([key, label]) => (
          <div className="review-field" key={key}>
            <span className="review-label" id={`q-${key}`}>{label}</span>
            <StarRow id={`q-${key}`} value={scores[key] || 0} onPick={(n) => setScores((s) => ({ ...s, [key]: n }))} />
          </div>
        ))}

        <div className="review-field">
          <span className="review-label">What did you like most, and what can we improve? <span className="muted">(optional)</span></span>
          <textarea
            className="review-comment"
            rows={3}
            maxLength={2000}
            placeholder="What worked, what didn’t, anything you want covered again…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        {err && <span className="error" role="alert">{err}</span>}

        <div className="inline-form">
          <button className={`btn ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Sending…' : 'Submit and continue'}</button>
          {remaining > 1 && <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{remaining} classes to review</span>}
        </div>
      </form>
    </div>
  );
}
