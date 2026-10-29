import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import Empty, { Loading } from '../../components/Empty.jsx';
import LineIcon from '../../components/LineIcon.jsx';
import SpecialisationEditor, { NotesEditor } from '../../components/SpecialisationEditor.jsx';
import { SpecialisationView } from '../Specialisation.jsx';

// Specialisations — what a student takes up after the six weeks of the AI
// Generalist, and the admin's alone to run. Two screens on one tab:
//
//   the board      the six tracks, and every Generalist student with where
//                  they stand: not decided, in a track, or not opting.
//                  Allotting is one drop-down per row, or a whole selection
//                  at once.
//   a track        (?track=<id>) its syllabus, reading and teacher notes,
//                  who is in it, and a Student view of exactly what they see.
//
// None of it touches batches, sessions, assignments or the Learning tab
// (server/routes/specialisations.js). The track is in the URL so a reload,
// the back button and a link to a colleague all land on the same screen.

const accent = (i) => ({ '--sp-accent': `var(--a${(i % 6) + 1})`, '--sp-soft': `var(--a${(i % 6) + 1}-soft)`, '--sp-ink': `var(--a${(i % 6) + 1}-ink)` });

export default function AdminSpecialisations() {
  const [params, setParams] = useSearchParams();
  const trackId = params.get('track');
  const [specs, setSpecs] = useState(null);
  const [optedOut, setOptedOut] = useState(0);
  const [err, setErr] = useState('');

  const loadSpecs = useCallback(() => api('/specialisations')
    .then((d) => { setSpecs(d.specialisations || []); setOptedOut(d.opted_out || 0); })
    .catch((e) => setErr(e.message)), []);
  useEffect(() => { loadSpecs(); }, [loadSpecs]);

  const openTrack = (id) => setParams(id ? { track: id } : {});

  if (err) return <div className="panel"><Empty icon="specialisations" title="Couldn’t load the specialisations." hint={err} /></div>;
  if (!specs) return <div className="panel"><Loading rows={5} /></div>;

  if (trackId) {
    const index = specs.findIndex((s) => s._id === trackId);
    return (
      <Track
        key={trackId}
        id={trackId}
        index={Math.max(index, 0)}
        specs={specs}
        onBack={() => { openTrack(null); loadSpecs(); }}
        onAllotted={loadSpecs}
      />
    );
  }

  return <Board specs={specs} optedOut={optedOut} onOpen={openTrack} onAllotted={loadSpecs} />;
}

// ── The board ───────────────────────────────────────────────────────────────

const STATUS = [
  ['all', 'All'],
  ['undecided', 'Not decided'],
  ['allotted', 'In a track'],
  ['opted_out', 'Not opting'],
];
const statusOf = (s) => (s.allotment ? s.allotment.status : 'undecided');
// The value of the row's drop-down: a track id, 'none' for not opting, '' for
// not decided — exactly what POST /allot takes.
const choiceOf = (s) => (!s.allotment ? '' : s.allotment.status === 'opted_out' ? 'none' : s.allotment.specialisation_id || '');

function Board({ specs, optedOut, onOpen, onAllotted }) {
  const [data, setData] = useState(null); // { programme, batches, students }
  const [err, setErr] = useState('');
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [bulkTo, setBulkTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const msgTimer = useRef(null);

  useEffect(() => {
    // Only the newest request lands, so a slow one cannot undo an allotment
    // made while it was in flight.
    let live = true;
    api('/specialisations/candidates')
      .then((d) => { if (live) setData((cur) => cur || d); })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, []);

  const flash = (m) => { setMsg(m); clearTimeout(msgTimer.current); msgTimer.current = setTimeout(() => setMsg(''), 5000); };
  const titleOf = (id) => (id === 'none' ? 'Not opting' : id === '' ? 'Not decided' : specs.find((s) => s._id === id)?.title || 'a track');

  const students = data?.students || [];
  const inBatch = useMemo(() => students.filter((s) => !batchId || s.batch_ids.includes(batchId)), [students, batchId]);
  const counts = useMemo(() => {
    const c = { all: inBatch.length, undecided: 0, allotted: 0, opted_out: 0 };
    for (const s of inBatch) c[statusOf(s)] += 1;
    return c;
  }, [inBatch]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inBatch.filter((s) => (status === 'all' || statusOf(s) === status)
      && (!needle || `${s.full_name} ${s.email}`.toLowerCase().includes(needle)));
  }, [inBatch, status, q]);

  const batchName = (id) => data?.batches.find((b) => String(b.id) === id)?.name || '';

  async function allot(ids, to) {
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      const r = await api('/specialisations/allot', { method: 'POST', body: { studentIds: ids, to } });
      setData((d) => ({ ...d, students: d.students.map((s) => (s.id in r.allotments ? { ...s, allotment: r.allotments[s.id] } : s)) }));
      const who = ids.length === 1 ? (students.find((s) => s.id === ids[0])?.full_name || 'the student') : `${ids.length} students`;
      const told = r.notified ? ` ${r.notified === 1 ? 'They have' : `${r.notified} have`} been notified.` : '';
      flash(to === '' ? `${who} set back to not decided.` : to === 'none' ? `${who} marked as not opting.` : `${who} placed in ${titleOf(to)}.${told}`);
      setPicked(new Set());
      onAllotted();
    } catch (e) { flash(e.message); }
    finally { setBusy(false); }
  }

  const allShownPicked = shown.length > 0 && shown.every((s) => picked.has(s.id));
  const togglePick = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked(allShownPicked ? new Set() : new Set(shown.map((s) => s.id)));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">After the Generalist</div>
          <h1>Specialisations</h1>
          <p>Place the students who finished the six weeks in the track they chose, and build each track’s syllabus, reading and teacher notes. Nothing here changes their Generalist batch.</p>
        </div>
      </div>

      <div className="sp-tracks">
        {specs.map((s, i) => (
          <button type="button" className="sp-track" style={accent(i)} key={s._id} onClick={() => onOpen(s._id)}>
            <span className="sp-track-title">{s.title}</span>
            <span className="sp-track-n"><b>{s.students}</b> {s.students === 1 ? 'student' : 'students'}</span>
            <span className="sp-track-meta">
              {s.modules ? `${s.modules} module${s.modules === 1 ? '' : 's'} · ${s.lessons} lesson${s.lessons === 1 ? '' : 's'}` : 'No syllabus yet'}
              {s.files ? ` · ${s.files} file${s.files === 1 ? '' : 's'}` : ''}
            </span>
            <span className="sp-track-go">Open <LineIcon name="chevron" size={13} /></span>
          </button>
        ))}
      </div>
      {optedOut > 0 && <p className="muted sp-optout-note">{optedOut} {optedOut === 1 ? 'student has' : 'students have'} chosen not to take a specialisation.</p>}

      <h3 className="ruled-head sp-board-head">Allot students</h3>
      {err && <div className="panel"><Empty icon="students" title="Couldn’t load the students." hint={err} /></div>}
      {!err && !data && <div className="panel"><Loading rows={6} /></div>}

      {data && (
        <>
          {!data.programme && (
            <p className="muted">There is no AI Generalist programme yet, so only students already placed are listed.</p>
          )}
          <div className="list-filter sp-filter">
            {data.batches.length > 0 && (
              <label>
                <span className="muted">Generalist batch</span>
                <select value={batchId} onChange={(e) => { setBatchId(e.target.value); setPicked(new Set()); }}>
                  <option value="">All batches</option>
                  {data.batches.map((b) => <option key={b.id} value={String(b.id)}>{b.name} · {b.students}</option>)}
                </select>
              </label>
            )}
            <input className="sp-search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
          </div>
          <div className="sp-status" role="tablist" aria-label="Filter by where they stand">
            {STATUS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={status === k} className={`sp-pill ${status === k ? 'on' : ''}`} onClick={() => { setStatus(k); setPicked(new Set()); }}>
                {label} <span className="sp-pill-n">{counts[k]}</span>
              </button>
            ))}
          </div>

          {picked.size > 0 && (
            <div className="sp-bulk" role="region" aria-label="Allot the selected students">
              <strong>{picked.size} selected</strong>
              <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} aria-label="Allot the selected students to">
                <option value="" disabled>Allot to…</option>
                {specs.map((s) => <option key={s._id} value={s._id}>{s.title}</option>)}
                <option value="none">Not opting</option>
                <option value="clear">Not decided</option>
              </select>
              <button type="button" className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={!bulkTo || busy} onClick={() => allot([...picked], bulkTo === 'clear' ? '' : bulkTo)}>Apply</button>
              <button type="button" className="mm-linkbtn" onClick={() => setPicked(new Set())}>clear</button>
            </div>
          )}

          {msg && <p className="sp-msg" role="status">{msg}</p>}

          {shown.length > 0 && (
            <div className="sp-rows">
              <label className="sp-row sp-row-head">
                <input type="checkbox" checked={allShownPicked} onChange={toggleAll} aria-label="Select everyone shown" />
                <span className="muted">Select all {shown.length} shown</span>
              </label>
              {shown.map((s) => (
                <div className={`sp-row ${picked.has(s.id) ? 'picked' : ''}`} key={s.id}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => togglePick(s.id)} aria-label={`Select ${s.full_name || s.email}`} />
                  <div className="sp-row-who">
                    <strong>{s.full_name || s.email}</strong>
                    {s.blocked && <span className="badge badge-blocked">blocked</span>}
                    <div className="muted">
                      {s.full_name && <>{s.email} · </>}
                      {s.batch_ids.length ? s.batch_ids.map(batchName).filter(Boolean).join(', ') : 'in no Generalist batch'}
                    </div>
                  </div>
                  <div className="sp-row-prog" title="Lessons ticked off in the AI Generalist">
                    <span className="sp-bar" aria-hidden="true"><span style={{ width: `${s.progress}%` }} /></span>
                    <span className="muted">{s.progress}%</span>
                    {s.certified && <span className="badge badge-student">certified</span>}
                  </div>
                  <AllotSelect specs={specs} value={choiceOf(s)} disabled={busy} onChange={(to) => allot([s.id], to)} label={s.full_name || s.email} />
                </div>
              ))}
            </div>
          )}

          {shown.length === 0 && (
            <div className="panel">
              {students.length === 0 ? (
                <Empty icon="students" title="No Generalist students yet." hint="Students enrolled in an AI Generalist batch appear here, ready to be placed once they finish the six weeks." />
              ) : (
                <Empty icon="students" title="Nobody matches these filters." hint="Try another batch, a different status, or clear the search." />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Where one student stands, as one drop-down: the six tracks, not opting, or
// not decided. Saves on change.
function AllotSelect({ specs, value, onChange, disabled, label }) {
  return (
    <select className={`sp-allot ${value === '' ? 'is-undecided' : value === 'none' ? 'is-out' : 'is-in'}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={`Specialisation for ${label}`}>
      <option value="">Not decided</option>
      <optgroup label="Specialisation">
        {specs.map((s) => <option key={s._id} value={s._id}>{s.title}</option>)}
      </optgroup>
      <option value="none">Not opting</option>
    </select>
  );
}

// ── One track ───────────────────────────────────────────────────────────────

const TABS = [
  ['syllabus', 'Syllabus'],
  ['students', 'Students'],
  ['about', 'About & resources'],
  ['preview', 'Student view'],
];

function Track({ id, index, specs, onBack, onAllotted }) {
  const [tab, setTab] = useState('syllabus');
  const [doc, setDoc] = useState(null);
  const [roster, setRoster] = useState([]);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('saved'); // saved | pending | saving | error
  const [saveErr, setSaveErr] = useState('');
  const [rosterBusy, setRosterBusy] = useState(false);

  // The draft lives in a ref as well as in state: a save reads the latest
  // draft, not the one that was current when its timer was set.
  const docRef = useRef(null);
  const version = useRef(null);
  const timer = useRef(null);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const again = useRef(false);

  // A load that answers after the admin has started editing must not land:
  // it would put the stored copy back over their first change on screen.
  // `live` drops a superseded request; `dirty` drops one that is late.
  useEffect(() => {
    let live = true;
    api(`/specialisations/${id}`)
      .then((d) => {
        if (!live || dirty.current || docRef.current) return;
        const s = normalise(d.specialisation);
        docRef.current = s;
        version.current = s.updatedAt;
        setDoc(s);
        setRoster(d.roster || []);
      })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [id]);

  const flush = useCallback(async () => {
    if (!dirty.current || !docRef.current) return;
    if (inFlight.current) { again.current = true; return; }
    inFlight.current = true;
    dirty.current = false;
    setStatus('saving');
    const d = docRef.current;
    try {
      const r = await api(`/specialisations/${d._id}`, {
        method: 'PATCH',
        body: { title: d.title, description: d.description, modules: d.modules, resources: d.resources, version: version.current },
      });
      version.current = r.specialisation.updatedAt;
      setSaveErr('');
      setStatus(dirty.current ? 'pending' : 'saved');
    } catch (e) {
      if (e.status === 409 && e.data?.specialisation) {
        // Someone else saved first. Theirs is loaded; ours is not forced over it.
        const s = normalise(e.data.specialisation);
        docRef.current = s;
        version.current = s.updatedAt;
        setDoc(s);
        dirty.current = false;
      } else {
        dirty.current = true;
      }
      setSaveErr(e.message);
      setStatus('error');
    } finally {
      inFlight.current = false;
      if (again.current) { again.current = false; flush(); }
    }
  }, []);

  // Apply a change to the draft (fn mutates a copy) and save after `delay`.
  // edit(null, 0) just saves now — what leaving a text field does.
  const edit = useCallback((fn, delay = 0) => {
    if (fn) {
      const next = structuredClone(docRef.current);
      fn(next);
      docRef.current = next;
      setDoc(next);
      dirty.current = true;
      setStatus('pending');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush]);

  // Never lose a pause's worth of typing: save on the way out of the track,
  // and have the browser ask before a tab is closed on unsaved work.
  useEffect(() => {
    const warn = (e) => { if (dirty.current || inFlight.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      clearTimeout(timer.current);
      if (dirty.current) flush();
    };
  }, [flush]);

  async function moveStudent(studentId, to) {
    setRosterBusy(true);
    try {
      await api('/specialisations/allot', { method: 'POST', body: { studentIds: [studentId], to } });
      if (to !== id) setRoster((r) => r.filter((x) => x.id !== studentId));
      onAllotted();
    } catch (e) { window.alert(e.message); }
    finally { setRosterBusy(false); }
  }

  if (err) return <div className="panel"><Empty icon="specialisations" title="Couldn’t open this specialisation." hint={err} action={{ label: '← Specialisations', onClick: onBack }} /></div>;
  if (!doc) return <div className="panel"><Loading rows={5} /></div>;

  const saveLabel = { saved: 'All changes saved', pending: 'Unsaved changes…', saving: 'Saving…', error: 'Not saved' }[status];

  return (
    <div className="sp-ws" style={accent(index)}>
      <div className="ce-bar">
        <button type="button" className="btn ghost sm" onClick={() => { edit(null, 0); onBack(); }}>← Specialisations</button>
        <div className="ce-bar-title">
          <strong>{doc.title}</strong>
          <span className="muted"> · Specialisation</span>
        </div>
        <span className={`sp-save is-${status}`} role="status">
          {status === 'saved' && <LineIcon name="check" size={14} />} {saveLabel}
          {status === 'error' && dirty.current && <button type="button" className="mm-linkbtn" onClick={() => { clearTimeout(timer.current); flush(); }}>retry</button>}
        </span>
      </div>
      {saveErr && <p className="error sp-save-err" role="alert">{saveErr}</p>}

      <div className="tabs sp-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {label}{k === 'students' ? ` · ${roster.length}` : ''}
          </button>
        ))}
      </div>

      {tab === 'syllabus' && <SpecialisationEditor doc={doc} edit={edit} />}

      {tab === 'students' && (
        <div>
          <p className="muted sp-tab-intro">Students placed in {doc.title}. They see this track on their own Specialisation tab. To place more, go back to <button type="button" className="mm-linkbtn sp-inline" onClick={onBack}>Allot students</button>.</p>
          {roster.length === 0 ? (
            <div className="panel"><Empty icon="students" title={`Nobody is in ${doc.title} yet.`} hint="Place students from the list on the Specialisations page. Each one is notified when they are placed." action={{ label: 'Allot students', onClick: onBack }} /></div>
          ) : (
            <div className="sp-rows">
              {roster.map((s) => (
                <div className="sp-row" key={s.id}>
                  <div className="sp-row-who">
                    <strong>{s.full_name || s.email}</strong>
                    <div className="muted">
                      {s.full_name && <>{s.email} · </>}
                      {s.batches.length ? s.batches.join(', ') : 'in no Generalist batch'}
                      {s.allotted_at && <> · placed {new Date(s.allotted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</>}
                    </div>
                  </div>
                  <AllotSelect specs={specs} value={id} disabled={rosterBusy} onChange={(to) => moveStudent(s.id, to)} label={s.full_name || s.email} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'about' && (
        <div className="panel sp-about-edit">
          <label className="ce-label" htmlFor="sp-name">Name</label>
          <input
            id="sp-name"
            className="ce-field"
            value={doc.title}
            onChange={(e) => { const v = e.target.value; edit((d) => { d.title = v; }, 900); }}
            onBlur={() => edit(null, 0)}
          />
          <label className="ce-label" htmlFor="sp-desc">About this track <span className="muted">(Markdown · the first thing a student reads on their tab)</span></label>
          <textarea
            id="sp-desc"
            className="ce-field"
            rows={8}
            value={doc.description || ''}
            placeholder="Who this specialisation is for, what it covers, and where it leads."
            onChange={(e) => { const v = e.target.value; edit((d) => { d.description = v; }, 900); }}
            onBlur={() => edit(null, 0)}
          />
          <div className="sp-about-res">
            <NotesEditor
              items={doc.resources || []}
              label="Track resources"
              hint="A handbook, a reading list, a template pack — anything for the whole track rather than one module. Listed at the top of the student’s page."
              onChange={(fn) => edit((d) => fn(d.resources))}
            />
          </div>
        </div>
      )}

      {tab === 'preview' && (
        <div className="sp-preview">
          <p className="muted sp-tab-intro">Exactly what a student in {doc.title} sees on their Specialisation tab.</p>
          <div className="page-head">
            <div>
              <div className="eyebrow">Your specialisation</div>
              <h1>{doc.title}</h1>
              <p>After the AI Generalist</p>
            </div>
          </div>
          <SpecialisationView spec={doc} />
        </div>
      )}
    </div>
  );
}

// Every list present, so the editor never has to ask.
function normalise(s) {
  return {
    ...s,
    description: s.description || '',
    resources: s.resources || [],
    modules: (s.modules || []).map((m) => ({
      ...m,
      materials: m.materials || [],
      lessons: (m.lessons || []).map((l) => ({ ...l, materials: l.materials || [] })),
    })),
  };
}
