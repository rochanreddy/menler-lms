import { useEffect, useState } from 'react';
import { api } from '../api.js';

// The review a student owes for the last class, asked before anything else.
//
// It covers the whole app rather than sitting on Home: feedback gathered "when
// they get round to it" is feedback from the few who do, and the point of
// asking every student is a complete picture of how the class landed. Escape
// closes nothing and there is no dismiss — the only way out is to answer.
const PACES = [
  ['slow', 'Too slow'],
  ['right', 'Just right'],
  ['fast', 'Too fast'],
];
const RATING_WORDS = ['', 'Poor', 'Not great', 'Fine', 'Good', 'Excellent'];

export default function ClassReviewGate({ pending, onDone }) {
  const { session, remaining } = pending;
  const [rating, setRating] = useState(0);
  const [pace, setPace] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Nothing behind the gate should scroll while it is up.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // A fresh, empty form for the next class in the queue.
  useEffect(() => { setRating(0); setPace(''); setComment(''); setErr(''); }, [session._id]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!rating) { setErr('Pick a rating.'); return; }
    if (!pace) { setErr('Tell us how the pace felt.'); return; }
    setErr(''); setBusy(true);
    try {
      const r = await api(`/reviews/${session._id}`, { method: 'POST', body: { rating, pace, comment } });
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

        <div className="review-field">
          <span className="review-label">Your rating</span>
          <div className="review-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`review-star ${rating >= n ? 'on' : ''}`}
                aria-label={`${n} out of 5`}
                aria-pressed={rating === n}
                onClick={() => setRating(n)}
              >★</button>
            ))}
            <span className="muted review-star-word">{RATING_WORDS[rating] || ''}</span>
          </div>
        </div>

        <div className="review-field">
          <span className="review-label">The pace was</span>
          <div className="inline-form" style={{ marginTop: 0 }}>
            {PACES.map(([key, label]) => (
              <button key={key} type="button" className={`btn sm ${pace === key ? '' : 'ghost'}`} aria-pressed={pace === key} onClick={() => setPace(key)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="review-field">
          <span className="review-label">Anything you want to tell us? <span className="muted">(optional)</span></span>
          <textarea
            className="review-comment"
            rows={3}
            maxLength={2000}
            placeholder="What worked, what didn't, anything you want covered again…"
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
