import { useState } from 'react';
import DateTimePicker from './DateTimePicker.jsx';

// The four authoring forms a mentor uses inside a batch: post an announcement,
// schedule a session, build a quiz, set an assignment. Extracted from
// BatchWorkspace.jsx unchanged — each is self-contained, holding only its own
// draft state and handing the finished object to the workspace via a callback.

export function AnnouncementForm({ onPost }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onPost({ title, body }); setTitle(''); setBody(''); } }} style={{ marginBottom: 8 }}>
      <div className="inline-form">
        <input placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
        <button className="btn sm">Post &amp; notify</button>
      </div>
      <input placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%', marginTop: 8 }} className="ann-body" />
    </form>
  );
}

export function SessionForm({ onAdd }) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [zoomMeetingId, setZoomMeetingId] = useState('');
  return (
    <>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (title && startsAt) { onAdd({ title, startsAt: new Date(startsAt).toISOString(), joinUrl, zoomMeetingId }); setTitle(''); setStartsAt(''); setJoinUrl(''); setZoomMeetingId(''); } }}>
        <input placeholder="Session title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <DateTimePicker value={startsAt} onChange={setStartsAt} placeholder="Starts at" />
        <input placeholder="Zoom link (https://…)" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} />
        <input placeholder="Zoom meeting ID (optional)" value={zoomMeetingId} onChange={(e) => setZoomMeetingId(e.target.value)} />
        <button className="btn sm">Add session</button>
      </form>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Meeting ID auto-fills from a zoom.us/j/… link. For a registration link, paste the numeric Meeting ID so Zoom-join attendance can be matched.</p>
    </>
  );
}

// Mentor quiz author: title/type + a growing list of questions, each with
// options and a "correct" radio.
export function QuizBuilder({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('quiz');
  const blank = () => ({ text: '', options: ['', ''], correctIndex: 0, explanation: '' });
  const [questions, setQuestions] = useState([blank()]);

  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const setOpt = (qi, oi, val) => setQ(qi, { options: questions[qi].options.map((o, idx) => (idx === oi ? val : o)) });
  const addOption = (qi) => setQ(qi, { options: [...questions[qi].options, ''] });
  const addQuestion = () => setQuestions((qs) => [...qs, blank()]);

  function submit(e) {
    e.preventDefault();
    const clean = questions
      .map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) }))
      .filter((q) => q.text.trim() && q.options.length >= 2);
    if (!title.trim() || clean.length === 0) return;
    onCreate({ title, type, questions: clean });
    setTitle(''); setType('quiz'); setQuestions([blank()]); setOpen(false);
  }

  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>+ New quiz / exam</button>;
  return (
    <form className="quiz-builder" onSubmit={submit}>
      <div className="inline-form">
        <input placeholder="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="quiz">Quiz</option><option value="exam">Exam</option></select>
      </div>
      {questions.map((q, qi) => (
        <div key={qi} className="quiz-q">
          <input placeholder={`Question ${qi + 1}`} value={q.text} onChange={(e) => setQ(qi, { text: e.target.value })} />
          {q.options.map((o, oi) => (
            <label key={oi} className="quiz-opt">
              <input type="radio" name={`correct-${qi}`} checked={q.correctIndex === oi} onChange={() => setQ(qi, { correctIndex: oi })} />
              <input placeholder={`Option ${oi + 1}`} value={o} onChange={(e) => setOpt(qi, oi, e.target.value)} />
            </label>
          ))}
          <button type="button" className="btn sm ghost" onClick={() => addOption(qi)}>+ option</button>
          <textarea
            className="quiz-why-input"
            rows={2}
            placeholder="Explanation (optional), shown to students after they answer"
            value={q.explanation}
            onChange={(e) => setQ(qi, { explanation: e.target.value })}
          />
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn sm ghost" onClick={addQuestion}>+ question</button>
        <button className="btn sm" type="submit">Post quiz</button>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Tick the radio next to the correct option. Explanations appear in the student's answer review.</p>
    </form>
  );
}

// What a mentor can demand inside the student's Drive folder. Ticking 'html'
// also lifts the default block on HTML files for this assignment only.
export const DRIVE_TYPES = [
  { key: 'video', label: 'Video', hint: 'screen recording, demo' },
  { key: 'image', label: 'Photo / screenshot', hint: 'jpg, png' },
  { key: 'doc', label: 'Document', hint: 'PDF, Word, text file' },
  { key: 'slides', label: 'Slide deck', hint: 'PPT, Google Slides' },
  { key: 'html', label: 'HTML file', hint: 'blocked unless ticked' },
];

export function AssignmentForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('assignment');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [required, setRequired] = useState(['video', 'image', 'doc']);
  const [err, setErr] = useState('');

  function reset() {
    setTitle(''); setType('assignment'); setDescription('');
    setStartDate(''); setDueDate(''); setRequired(['video', 'image', 'doc']);
    setErr(''); setOpen(false);
  }

  function toggleType(key) {
    setRequired((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
      return setErr('The start date must be before the last date for submission.');
    }
    onAdd({
      title: title.trim(),
      type,
      description: description.trim(),
      startDate: startDate ? new Date(startDate).toISOString() : null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      requiredDriveTypes: required,
    });
    reset();
  }

  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>+ New assignment</button>;

  return (
    <form className="af" onSubmit={submit}>
      <div className="af-top">
        <input className="af-title" placeholder={type === 'project' ? 'Project title' : 'Assignment title'} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="af-seg">
          <button type="button" className={type === 'assignment' ? 'on' : ''} onClick={() => setType('assignment')}>Assignment</button>
          <button type="button" className={type === 'project' ? 'on' : ''} onClick={() => setType('project')}>Project</button>
        </div>
      </div>

      <label className="af-label">Description &amp; instructions</label>
      <textarea
        className="af-desc"
        rows={6}
        placeholder={"Explain the task clearly:\n• What students need to do\n• Deliverables to submit (link, repo, doc…)\n• How it will be graded\n\nMarkdown supported, **bold**, - lists, `code`."}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label className="af-label">Required in the Drive folder</label>
      <p className="af-hint">
        The automated check rejects a submission whose folder is missing any ticked item.
        Untick everything to accept any files.
      </p>
      <div className="af-reqs">
        {DRIVE_TYPES.map((t) => (
          <label key={t.key} className={`af-req ${required.includes(t.key) ? 'on' : ''}`}>
            <input type="checkbox" checked={required.includes(t.key)} onChange={() => toggleType(t.key)} />
            <span>
              <strong>{t.label}</strong>
              <span className="muted"> · {t.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {err && <p className="sub-check-error">{err}</p>}

      <div className="af-foot">
        <label className="af-due">
          <span>Start date <span className="muted">(optional)</span></span>
          <DateTimePicker value={startDate} onChange={setStartDate} placeholder="Open immediately" />
        </label>
        <label className="af-due">
          <span>Last date to submit <span className="muted">(optional)</span></span>
          <DateTimePicker value={dueDate} onChange={setDueDate} placeholder="No deadline" />
        </label>
        <div className="af-actions">
          <button type="button" className="btn ghost sm" onClick={reset}>Cancel</button>
          <button className="btn sm" disabled={!title.trim()}>Post {type}</button>
        </div>
      </div>
    </form>
  );
}
