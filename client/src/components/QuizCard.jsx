import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Markdown from './Markdown.jsx';
import LineIcon from './LineIcon.jsx';
import Ring from './Ring.jsx';

// One quiz: take it, then review it. Extracted from pages/Learning.jsx, which
// had grown to hold three unrelated screens — this is the quiz one, moved
// verbatim. The stepper and the review view live here too because nothing
// outside a quiz uses them.
export default function QuizCard({ quiz, onDone }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [review, setReview] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const attempt = quiz.myAttempt;
  const total = quiz.questions.length;
  const allAnswered = quiz.questions.every((_, i) => answers[i] != null);
  const q = quiz.questions[qIndex];

  // Once answering has begun, warn before an accidental tab close / reload —
  // draft answers live only in local state and aren't saved until submit.
  const dirty = open && !attempt && Object.keys(answers).length > 0 && !busy;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const ordered = quiz.questions.map((_, i) => (answers[i] ?? -1));
      await api(`/quizzes/${quiz._id}/attempt`, { method: 'POST', body: { answers: ordered } });
      onDone();
    } finally { setBusy(false); }
  }

  // Fetched once, then toggled — the review never changes after an attempt.
  async function toggleReview() {
    if (review) { setShowReview((v) => !v); return; }
    setBusy(true);
    try {
      setReview(await api(`/quizzes/${quiz._id}/review`));
      setShowReview(true);
    } finally { setBusy(false); }
  }

  const pct = attempt && attempt.total ? Math.round((attempt.score / attempt.total) * 100) : null;

  const isExam = quiz.type === 'exam';
  return (
    <div className={`panel quiz-card qc ${attempt ? 'qc-done' : open ? 'qc-live' : 'qc-todo'}`}>
      {/* One row that says everything: the score ring (or a "not taken" mark),
          the title and its size, and the single thing you can do next. */}
      <div className="qc-head">
        {attempt
          ? <Ring pct={pct} size={48} label={`Scored ${pct}%`} />
          : <span className={`ring ring-idle qc-idle ${isExam ? 'is-exam' : ''}`} aria-hidden="true"><LineIcon name={isExam ? 'award' : 'check'} size={18} /></span>}
        <div className="qc-copy">
          <div className="qc-title">{quiz.title}</div>
          <div className="qc-meta">
            <span className={`ac-type ${isExam ? 'is-exam' : ''}`}>{quiz.type}</span>
            <span>{total} question{total === 1 ? '' : 's'}</span>
            {attempt && <span>{attempt.score} of {attempt.total} correct</span>}
          </div>
        </div>
        <div className="qc-actions">
          {!attempt && !open && <button className="btn sm" onClick={() => { setOpen(true); setQIndex(0); }}>{isExam ? 'Start exam' : 'Take quiz'} →</button>}
          {!attempt && open && <span className="qc-live-tag">In progress</span>}
          {attempt && (
            <button className={`btn sm ghost ${busy ? 'is-busy' : ''}`} onClick={toggleReview} disabled={busy}>
              {busy ? 'Loading…' : showReview ? 'Hide review' : 'Review answers'}
            </button>
          )}
        </div>
      </div>
      {showReview && review && <QuizReview questions={review.questions} />}
      {!attempt && open && (
        <form onSubmit={submit} className="quiz-take">
          <QuizStepper
            count={total}
            current={qIndex}
            onSelect={setQIndex}
            statusFor={(i) => (answers[i] != null ? 'answered' : 'unanswered')}
          />
          <div className="quiz-take-q-solo">
            <p className="quiz-take-q-count">Question {qIndex + 1} of {total}</p>
            <p className="quiz-take-q-text"><strong>{q.text}</strong></p>
            {q.options.map((o, oi) => (
              <label key={oi} className="quiz-opt">
                <input type="radio" name={`q-${quiz._id}-${qIndex}`} checked={answers[qIndex] === oi} onChange={() => setAnswers((a) => ({ ...a, [qIndex]: oi }))} />
                {o}
              </label>
            ))}
          </div>
          <div className="quiz-take-nav">
            <button type="button" className="btn ghost sm" disabled={qIndex === 0} onClick={() => setQIndex((i) => i - 1)}>← Previous</button>
            {qIndex < total - 1 ? (
              <button type="button" className="btn sm" onClick={() => setQIndex((i) => i + 1)}>Next →</button>
            ) : (
              <button className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={busy || !allAnswered}>{busy ? 'Submitting…' : 'Submit answers'}</button>
            )}
          </div>
          {qIndex === total - 1 && !allAnswered && <p className="muted quiz-take-hint">Answer every question to submit.</p>}
        </form>
      )}
    </div>
  );
}

// Numbered step navigation shared by the take-quiz and review-quiz views, so
// a student jumps straight to any question instead of scrolling a stack of
// blocks. `statusFor` colors each pip: answered/unanswered while taking,
// correct/incorrect while reviewing.
function QuizStepper({ count, current, onSelect, statusFor }) {
  return (
    <div className="quiz-stepper" role="tablist" aria-label="Questions">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === current}
          className={`quiz-step ${statusFor(i)} ${i === current ? 'current' : ''}`}
          onClick={() => onSelect(i)}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

// Post-attempt feedback: every question with the student's pick, the right
// answer, and the mentor's explanation. This is where the quiz actually
// teaches — shown one question at a time via the stepper above it.
function QuizReview({ questions }) {
  const [qIndex, setQIndex] = useState(0);
  const total = questions.length;
  const q = questions[qIndex];

  return (
    <div className="quiz-review">
      <QuizStepper
        count={total}
        current={qIndex}
        onSelect={setQIndex}
        statusFor={(i) => (questions[i].isCorrect ? 'correct' : 'incorrect')}
      />

      <div className={`qr-q ${q.isCorrect ? 'ok' : 'bad'}`}>
        <div className="qr-q-head">
          <span className={`qr-mark ${q.isCorrect ? 'ok' : 'bad'}`}>{q.isCorrect ? '✓' : '✗'}</span>
          <div>
            <div className="qr-q-count">Question {qIndex + 1} of {total}</div>
            <strong>{q.text}</strong>
          </div>
        </div>

        <div className="qr-opts">
          {q.options.map((o, oi) => {
            const isCorrect = oi === q.correctIndex;
            const isMine = oi === q.myAnswer;
            return (
              <div key={oi} className={`qr-opt ${isCorrect ? 'correct' : isMine ? 'wrong' : ''}`}>
                <span>{o}</span>
                {isCorrect && <span className="qr-tag tag-correct">{isMine ? 'Your answer · correct' : 'Correct answer'}</span>}
                {isMine && !isCorrect && <span className="qr-tag tag-wrong">Your answer</span>}
              </div>
            );
          })}
        </div>

        {q.myAnswer === null && <p className="muted qr-blank">You left this one blank.</p>}

        {q.explanation && (
          <div className="qr-why">
            <div className="qr-why-label">Why</div>
            <Markdown text={q.explanation} />
          </div>
        )}
      </div>

      <div className="quiz-take-nav">
        <button type="button" className="btn ghost sm" disabled={qIndex === 0} onClick={() => setQIndex((i) => i - 1)}>← Previous</button>
        <button type="button" className="btn ghost sm" disabled={qIndex === total - 1} onClick={() => setQIndex((i) => i + 1)}>Next →</button>
      </div>
    </div>
  );
}
