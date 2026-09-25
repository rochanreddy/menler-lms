import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, addWebinarResources, removeWebinarResource, addShelfResources, removeShelfResource } from '../../api.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import LineIcon from '../../components/LineIcon.jsx';
import FileViewer from '../../components/FileViewer.jsx';
import { opensInReader } from '../../components/ReadingPicker.jsx';
import Empty from '../../components/Empty.jsx';

// Webinars — admin schedules; mentors and students join. One page for all
// three roles: the list is identical, only the scheduling form is an admin's.
//
// Masterclasses are not batch-scoped. A guest session on evaluating RAG is
// worth the same to a Kickstarter student as to a Generalist one, so every
// signed-in learner sees every webinar — which is also why the page needs no
// batch filter.
//
// Split upcoming from past rather than listing by date alone. A student opens
// this to answer "what's next and how do I get in"; the archive is a different
// question, asked less often, and answered further down the page.
export default function Webinar() {
  const { user } = useOutletContext();
  const canAdd = user.role === 'admin';
  const [webinars, setWebinars] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ title: '', startsAt: '', joinUrl: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api('/webinars')
    .then((d) => setWebinars(d.webinars || []))
    .catch(() => {})
    .finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);

  // A resource push returns the whole webinar, so the list is patched in place
  // rather than refetched: re-running the query would collapse a drawer the
  // admin is still working in.
  const replace = (w) => setWebinars((list) => list.map((x) => (x._id === w._id ? w : x)));

  async function add(e) {
    e.preventDefault();
    if (!form.title.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/webinars', { method: 'POST', body: { ...form, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null } });
      setForm({ title: '', startsAt: '', joinUrl: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  const now = Date.now();
  // A webinar with no date yet is still ahead of you, not behind you.
  const isPast = (w) => !!w.startsAt && new Date(w.startsAt).getTime() < now;
  const { upcoming, past } = useMemo(() => ({
    // Soonest first among the upcoming; most recent first among the archive.
    upcoming: webinars.filter((w) => !isPast(w)).sort((a, b) => new Date(a.startsAt || 8.64e15) - new Date(b.startsAt || 8.64e15)),
    past: webinars.filter(isPast).sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt)),
  }), [webinars, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = (w) => <WebinarRow key={w._id} w={w} past={isPast(w)} canEdit={canAdd} onChange={replace} />;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Webinars</div>
          <h1>Live masterclasses</h1>
          <p>{canAdd ? 'Upcoming sessions, slides and recordings.' : 'Open to every Menler student — join live, or catch the recording after.'}</p>
        </div>
      </div>

      {canAdd && (
        <form className="panel" onSubmit={add}>
          <h3>Schedule a webinar</h3>
          <div className="inline-form">
            <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <DateTimePicker value={form.startsAt} onChange={(v) => setForm((f) => ({ ...f, startsAt: v }))} placeholder="Starts at" />
            <input placeholder="Join link" value={form.joinUrl} onChange={(e) => setForm((f) => ({ ...f, joinUrl: e.target.value }))} />
            <button className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
          </div>
          <p className="muted">Every student is notified as soon as you add it. Mentors see it on this tab.</p>
          {err && <span className="error" role="alert">{err}</span>}
        </form>
      )}

      {upcoming.length > 0 && (
        <>
          <h3 className="ruled-head">Coming up</h3>
          <div className="list">{upcoming.map(row)}</div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h3 className="ruled-head">Past masterclasses</h3>
          <div className="list">{past.map(row)}</div>
        </>
      )}

      <Shelf canEdit={canAdd} />

      {loaded && webinars.length === 0 && (
        <div className="list">
          <Empty
            inline
            icon="webinar"
            title="No webinars scheduled yet."
            hint={canAdd
              ? 'Add one above and it appears for everyone here, and every student is notified.'
              : 'When a masterclass is scheduled you’ll get a notification, and it will show up here.'}
          />
        </div>
      )}
    </div>
  );
}

const fileName = (r) => r.name || r.url;

// The list of files, plus the admin's two ways of adding one. Shared by a
// masterclass card's drawer and by the shelf below them, so the two cannot
// disagree about what a resource looks like or how you attach one.
function ResourceList({ items, canEdit, empty, onAdd, onRemove }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');
  // A resource opens in Menler's own reader, the same one course PDFs use, so
  // a student stays on the page they were on. `opensInReader` is the
  // curriculum's rule reused: a link that is not a PDF opens in a new tab
  // rather than as a blank box in the reader.
  const [viewer, setViewer] = useState(null);
  const pick = useRef(null);

  const run = (fn) => async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try { await fn(); setLink(''); } catch (e) { setErr(e.message); }
    finally { setBusy(false); if (pick.current) pick.current.value = ''; }
  };

  return (
    <div className="wb-res">
      {items.map((r) => (
        <div className="wb-res-item" key={r._id || r.url}>
          {opensInReader(r.url) ? (
            <button type="button" className="wb-res-open" onClick={() => setViewer({ label: 'Resource', subtitle: fileName(r), url: r.url })}>
              <LineIcon name="file" size={15} />
              <span className="wb-res-name">{fileName(r)}</span>
            </button>
          ) : (
            <a href={r.url} target="_blank" rel="noreferrer">
              <LineIcon name="file" size={15} />
              <span className="wb-res-name">{fileName(r)}</span>
            </a>
          )}
          {canEdit && (
            <button type="button" className="icon-btn" title="Remove" disabled={busy} onClick={run(() => onRemove(r))}>
              <LineIcon name="close" size={14} />
            </button>
          )}
        </div>
      ))}
      {!items.length && <p className="muted">{empty}</p>}

      {canEdit && (
        <div className="wb-res-add">
          <input
            ref={pick}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => e.target.files?.length && run(() => onAdd([...e.target.files], null))()}
          />
          <button type="button" className={`btn sm ghost ${busy ? 'is-busy' : ''}`} disabled={busy} onClick={() => pick.current?.click()}>
            <LineIcon name="upload" size={14} /> {busy ? 'Saving…' : 'Attach PDFs'}
          </button>
          <input
            type="text"
            placeholder="…or paste a link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (link.trim()) run(() => onAdd([], link.trim()))(); } }}
          />
          <button type="button" className="btn sm quiet" disabled={busy || !link.trim()} onClick={run(() => onAdd([], link.trim()))}>Add link</button>
        </div>
      )}
      {err && <span className="error" role="alert">{err}</span>}
      {/* A masterclass hand-out is not course material to be withheld, so the
          reader keeps its "Open in new tab" escape. */}
      {viewer && <FileViewer {...viewer} allowNewTab onClose={() => setViewer(null)} />}
    </div>
  );
}

// Files that belong to the tab rather than to one masterclass: a playbook, a
// template pack. Their own section rather than filed under a session they were
// never part of, which is a guess a student would then have to reverse.
// Rendered only when there is something on it — or for the admin, who is the
// one who puts the first file up.
function Shelf({ canEdit }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api('/webinars/shelf')
      .then((d) => setItems(d.resources || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || (!items.length && !canEdit)) return null;
  return (
    <>
      <h3 className="ruled-head">Resources</h3>
      <div className="panel">
        <p className="muted wb-shelf-hint">
          {canEdit
            ? 'Playbooks and templates for everyone, not tied to one masterclass. Every student and mentor sees these.'
            : 'Playbooks and templates that go with the masterclasses.'}
        </p>
        <ResourceList
          items={items}
          canEdit={canEdit}
          empty="Nothing on the shelf yet."
          onAdd={async (files, url) => setItems((await addShelfResources(files, url ? { url } : null)).resources)}
          onRemove={async (r) => setItems((await removeShelfResource(r._id)).resources)}
        />
      </div>
    </>
  );
}

function WebinarRow({ w, past, canEdit, onChange }) {
  const resources = w.resources || [];
  const [open, setOpen] = useState(false);

  const whenLabel = (iso) => new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  // One action owns the card, and clicking anywhere on the row runs it: the
  // join link while the session is ahead of you, the recording once it is
  // behind you, the slides if that is all there is. A masterclass row has one
  // obvious purpose, so hunting for a small word on the right of it is work
  // the card can do for you. `row-link` is what stretches that one link across
  // the panel; any other action stays clickable in its own right.
  //
  // Resources are deliberately NOT the lead: a card that opens a cheat sheet
  // when you meant to watch the recording is worse than no shortcut at all.
  const lead = (!past && w.joinUrl && 'join') || (w.recordingUrl && 'recording') || (w.pptUrl && 'slides') || null;

  return (
    <div className={`panel list-row ${lead ? 'is-linked' : ''}`}>
      <div>
        <strong>{w.title}</strong>{' '}
        <span className={`badge ${past ? 'badge-muted' : 'badge-student'}`}>{past ? 'past' : 'upcoming'}</span>
        <div className="muted">{w.startsAt ? whenLabel(w.startsAt) : 'Date to be announced'}</div>
      </div>
      <div className="row">
        {w.joinUrl && !past && (
          <a className={`btn sm ${lead === 'join' ? 'row-link' : ''}`} href={w.joinUrl} target="_blank" rel="noreferrer">
            <LineIcon name="video" size={14} /> Join
          </a>
        )}
        {w.pptUrl && (
          <a className={`btn sm quiet ${lead === 'slides' ? 'row-link' : ''}`} href={w.pptUrl} target="_blank" rel="noreferrer">
            <LineIcon name="slides" size={14} /> Slides
          </a>
        )}
        {/* Ghost rather than solid: four archived masterclasses in a column
            are a list to browse, not four things to do right now. */}
        {w.recordingUrl && (
          <a className={`btn sm ghost ${lead === 'recording' ? 'row-link' : ''}`} href={w.recordingUrl} target="_blank" rel="noreferrer">
            <LineIcon name="video" size={14} /> Watch recording
          </a>
        )}
        {/* The count is on the button because "are there any" is the question,
            and answering it without a click is most of the value. An admin
            sees the button on an empty masterclass too, since that is where
            they go to put the first file up; nobody else does, because a chip
            that opens an empty drawer teaches people to stop pressing it. */}
        {(resources.length > 0 || canEdit) && (
          <button type="button" className="btn sm quiet" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <LineIcon name="file" size={14} />
            {resources.length > 0 ? `Resources · ${resources.length}` : 'Add resources'}
          </button>
        )}
        {/* Said plainly rather than left as an empty row: a past masterclass
            with nothing attached looks like a broken link otherwise. */}
        {past && !w.recordingUrl && !w.pptUrl && !resources.length && <span className="muted">No recording yet</span>}
      </div>

      {open && (
        <ResourceList
          items={resources}
          canEdit={canEdit}
          empty="Nothing attached yet."
          onAdd={async (files, url) => onChange((await addWebinarResources(w._id, files, url ? { url } : null)).webinar)}
          onRemove={async (r) => onChange((await removeWebinarResource(w._id, r._id)).webinar)}
        />
      )}
    </div>
  );
}
