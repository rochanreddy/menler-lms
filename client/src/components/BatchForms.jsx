import { useEffect, useMemo, useState } from 'react';
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

// Admin: schedule a whole cohort at once — the way classes are actually
// planned, all six weeks up front. Pick the first class, the weekdays it
// repeats on and a length; the dates are worked out HERE, in the admin's own
// timezone ("Saturdays 7 pm" is a local fact the UTC server can't know), and
// titled from the programme's curriculum. Every row is previewed, with its
// title and its own Zoom link editable, before anything is created. Each class
// normally has its own Zoom meeting; a link left blank is added later with Edit.
const WEEK = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
const LENGTHS = [60, 90, 120, 150, 180, 210, 240];
function parseLocal(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}
const whenLabel = (d) => d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// `outline` has one title per curriculum session; `weeks` one per module. They
// differ only for a programme whose modules hold several sessions (the
// Generalist: 6 weeks × 2 sessions), and there the admin picks whether a class
// covers one session or a whole week — the Generalist teaches both of a
// week's sessions in one four-hour Sunday, so it wants 6 classes, not 12.
export function BulkSessionForm({ outline = [], weeks = [], onCreate }) {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState('');
  const [days, setDays] = useState([]);
  const [minutes, setMinutes] = useState(120);
  const [per, setPer] = useState('session'); // what one class covers
  const canGroup = weeks.length > 0 && weeks.length !== outline.length;
  const source = per === 'week' && canGroup ? weeks : outline;
  const [count, setCount] = useState(outline.length || 4);
  const [joinUrl, setJoinUrl] = useState('');
  const [zoomMeetingId, setZoomMeetingId] = useState('');
  const [edited, setEdited] = useState({}); // row index → title the admin typed
  const [links, setLinks] = useState({}); // row index → that session's own Zoom link
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // The curriculum arrives after the form mounts, and switching session/week
  // changes the list: either way the class count and titles follow it.
  // Keyed on the titles themselves, not the array: a parent re-render passing
  // an equal but new array must not wipe the admin's edits.
  const sourceKey = source.join('');
  useEffect(() => { if (source.length) setCount(source.length); setEdited({}); }, [sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The first class's weekday is always one of the class days.
  function pickFirst(v) {
    setFirst(v);
    const d = parseLocal(v);
    if (d) setDays((ds) => (ds.includes(d.getDay()) ? ds : [...ds, d.getDay()]));
  }
  const toggleDay = (n) => setDays((ds) => (ds.includes(n) ? ds.filter((x) => x !== n) : [...ds, n]));

  const plan = useMemo(() => {
    const start = parseLocal(first);
    if (!start || !days.length || !(count > 0)) return [];
    const rows = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    // 400 days is far past any real course; it only stops a runaway loop.
    for (let i = 0; rows.length < count && i < 400; i += 1) {
      if (days.includes(cur.getDay())) {
        const s = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), start.getHours(), start.getMinutes());
        rows.push({ startsAt: s, endsAt: new Date(s.getTime() + minutes * 60000) });
      }
      cur.setDate(cur.getDate() + 1);
    }
    return rows.map((r, i) => ({ ...r, title: edited[i] ?? source[i] ?? `Session ${i + 1}` }));
  }, [first, days, count, minutes, source, edited]);

  const past = plan.filter((r) => r.startsAt < new Date()).length;

  async function submit(e) {
    e.preventDefault();
    if (busy || !plan.length) return;
    if (plan.some((r) => !r.title.trim())) { setErr('Every session needs a title.'); return; }
    setErr(''); setBusy(true);
    try {
      await onCreate({
        joinUrl, zoomMeetingId,
        sessions: plan.map((r, i) => ({ title: r.title.trim(), startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), joinUrl: (links[i] || '').trim() })),
      });
      setOpen(false); setFirst(''); setDays([]); setEdited({}); setLinks({}); setJoinUrl(''); setZoomMeetingId('');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <div className="inline-form">
        <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}>Schedule the whole course…</button>
        <span className="muted" style={{ fontSize: 12 }}>All {outline.length || ''} sessions at once — add each Zoom link now or later.</span>
      </div>
    );
  }

  return (
    <form className="panel" style={{ marginTop: 'var(--space-3)' }} onSubmit={submit}>
      <h4 className="h-flush">Schedule the whole course</h4>
      <div className="inline-form">
        <DateTimePicker value={first} onChange={pickFirst} placeholder="First class — date & time" />
        <label className="muted">Length{' '}
          <select value={minutes} onChange={(e) => setMinutes(+e.target.value)}>
            {LENGTHS.map((m) => <option key={m} value={m}>{m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`}</option>)}
          </select>
        </label>
        <label className="muted">Sessions{' '}
          <input type="number" min={1} max={60} value={count} onChange={(e) => setCount(Math.max(0, Math.min(60, +e.target.value || 0)))} style={{ width: 70 }} />
        </label>
      </div>
      {canGroup && (
        <div className="inline-form">
          <span className="muted">One class covers</span>
          <button type="button" className={`btn sm ${per === 'session' ? '' : 'ghost'}`} aria-pressed={per === 'session'} onClick={() => setPer('session')}>
            One session ({outline.length} classes)
          </button>
          <button type="button" className={`btn sm ${per === 'week' ? '' : 'ghost'}`} aria-pressed={per === 'week'} onClick={() => setPer('week')}>
            A whole week ({weeks.length} classes)
          </button>
        </div>
      )}
      <div className="inline-form">
        <span className="muted">Repeats on</span>
        {WEEK.map(([label, n]) => (
          <button key={n} type="button" className={`btn sm ${days.includes(n) ? '' : 'ghost'}`} aria-pressed={days.includes(n)} onClick={() => toggleDay(n)}>{label}</button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Paste each session&rsquo;s own Zoom link in the table below, or leave any blank and add it later with <strong>Edit</strong>.
        Running the whole course on one recurring meeting instead? Put that link here and leave the table&rsquo;s links empty:
      </p>
      <div className="inline-form" style={{ marginTop: 4 }}>
        <input placeholder="Same Zoom link for every session (optional)" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
        <input placeholder="Its meeting ID (optional)" value={zoomMeetingId} onChange={(e) => setZoomMeetingId(e.target.value)} />
      </div>

      {plan.length > 0 && (
        <div className="table-wrap">
          <table className="grade-table">
            <thead><tr><th>#</th><th>When</th><th>Title</th><th>Zoom link</th></tr></thead>
            <tbody>
              {plan.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{whenLabel(r.startsAt)}{r.startsAt < new Date() && <span className="badge badge-muted" style={{ marginLeft: 6 }}>past</span>}</td>
                  <td style={{ width: '60%' }}>
                    <input value={r.title} onChange={(e) => setEdited((m) => ({ ...m, [i]: e.target.value }))} style={{ width: '100%', minWidth: 220 }} />
                  </td>
                  <td style={{ width: '40%' }}>
                    <input
                      placeholder={joinUrl.trim() ? 'Same as above' : 'Add later'}
                      value={links[i] || ''}
                      onChange={(e) => setLinks((m) => ({ ...m, [i]: e.target.value }))}
                      style={{ width: '100%', minWidth: 180 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {past > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {past} of these {past === 1 ? 'is' : 'are'} already in the past. Nobody is marked absent automatically for a class added after it happened — record those registers by hand.
        </p>
      )}
      {err && <span className="error" role="alert">{err}</span>}
      <div className="inline-form">
        <button className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={busy || !plan.length}>
          {busy ? 'Scheduling…' : plan.length ? `Create ${plan.length} session${plan.length === 1 ? '' : 's'}` : 'Pick a first class and days'}
        </button>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

// Admin: change one scheduled session — most often to paste its Zoom link once
// Zoom has made it, or to add the recording afterwards. Moving the start moves
// the end with it, so the class keeps its length.
const pad2 = (n) => String(n).padStart(2, '0');
const toLocalValue = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const idFromLink = (url) => (String(url || '').match(/\/j\/(\d{9,12})/) || [])[1] || '';

export function SessionEditForm({ session, onSave, onCancel }) {
  const [title, setTitle] = useState(session.title || '');
  const [startsAt, setStartsAt] = useState(toLocalValue(new Date(session.startsAt)));
  const [joinUrl, setJoinUrl] = useState(session.joinUrl || '');
  const [zoomMeetingId, setZoomMeetingId] = useState(session.zoomMeetingId || '');
  const [recordingUrl, setRecordingUrl] = useState(session.recordingUrl || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // A new link is a new meeting: follow it, or attendance would match the old one.
  function changeLink(v) { setJoinUrl(v); setZoomMeetingId(idFromLink(v)); }

  async function submit(e) {
    e.preventDefault();
    const start = parseLocal(startsAt);
    if (!title.trim() || !start) { setErr('A title and a start time are needed.'); return; }
    const body = { title: title.trim(), startsAt: start.toISOString(), joinUrl: joinUrl.trim(), zoomMeetingId, recordingUrl: recordingUrl.trim() };
    if (session.endsAt) {
      const length = new Date(session.endsAt) - new Date(session.startsAt);
      body.endsAt = new Date(start.getTime() + length).toISOString();
    }
    setErr(''); setBusy(true);
    try { await onSave(body); } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <form className="session-edit" onSubmit={submit}>
      <div className="inline-form">
        <input placeholder="Session title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
        <DateTimePicker value={startsAt} onChange={setStartsAt} placeholder="Starts at" />
      </div>
      <div className="inline-form">
        <input placeholder="Zoom link (https://…)" value={joinUrl} onChange={(e) => changeLink(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
        <input placeholder="Zoom meeting ID" value={zoomMeetingId} onChange={(e) => setZoomMeetingId(e.target.value)} />
      </div>
      <div className="inline-form">
        <input placeholder="Recording link, after the class (optional)" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
      </div>
      {err && <span className="error" role="alert">{err}</span>}
      <div className="inline-form">
        <button className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn sm ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
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
