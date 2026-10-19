import { useRef, useState } from 'react';
import { api, openStoredFile, saveShowcase } from '../api.js';
import useFetch from '../useFetch.js';
import Empty from './Empty.jsx';
import LineIcon from './LineIcon.jsx';

// The Kickstarter showcase: what a student built, why, and where to see it.
//
// Three things every entry must say — a title, what it is, and why they built
// it — and everything else is whatever the work needs: a live site has a URL
// and no PDF, a write-up is a PDF and nothing else. So links, a Drive folder
// and files are all optional, and the form says so rather than leaving a
// student to guess which empty box will stop them posting.
//
// It sits inside Assignments & Projects because that is where a student's
// work already lives, but it is not a submission: nothing here is graded, and
// an entry may or may not name the project it grew out of.

const MAX_FILES = 5;
const MAX_LINKS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Mirrors what the server's sniffer takes (utils/doubtAttachments.js). The
// picker is a convenience; the server reads the bytes and has the last word.
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.ipynb,.py,.js,.ts,.sql,.log';
const ACCEPT_EXT = new RegExp(`(${ACCEPT.split(',').map((e) => `\\${e}`).join('|')})$`, 'i');

const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const day = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// ── The student's board ─────────────────────────────────────────────────────
export function ShowcaseBoard({ data, setData }) {
  const [editing, setEditing] = useState(null); // null · 'new' · an entry
  const [view, setView] = useState('all');
  const entries = data.showcases || [];
  const mine = entries.filter((s) => s.mine);
  const shown = view === 'mine' ? mine : entries;

  const saved = (entry) => {
    setData((d) => {
      const rest = (d.showcases || []).filter((s) => s._id !== entry._id);
      return { ...d, showcases: [entry, ...rest].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) };
    });
    setEditing(null);
  };
  const removed = (id) => setData((d) => ({ ...d, showcases: (d.showcases || []).filter((s) => s._id !== id) }));

  return (
    <div className="sc">
      <div className="sc-intro panel">
        <span className="sc-intro-icon" aria-hidden="true"><LineIcon name="award" size={20} /></span>
        <div className="sc-intro-copy">
          <h2>Showcase your work</h2>
          <p>Built something during Kickstarter, for a project or on your own? Put it here for your cohort: what it is, why you built it, and where they can see it.</p>
        </div>
        {editing !== 'new' && (
          <button type="button" className="btn sm" onClick={() => setEditing('new')}>Add your work</button>
        )}
      </div>

      {editing === 'new' && (
        <ShowcaseForm batches={data.batches || []} onSaved={saved} onCancel={() => setEditing(null)} />
      )}

      {entries.length > 0 && (
        <div className="work-bar sc-bar">
          <div className="work-filters" role="tablist" aria-label="Show">
            <button role="tab" aria-selected={view === 'all'} className={`work-filter ${view === 'all' ? 'on' : ''}`} onClick={() => setView('all')}>Everyone <b>{entries.length}</b></button>
            <button role="tab" aria-selected={view === 'mine'} className={`work-filter ${view === 'mine' ? 'on' : ''}`} onClick={() => setView('mine')}>Yours <b>{mine.length}</b></button>
          </div>
        </div>
      )}

      {entries.length === 0 && editing !== 'new' ? (
        <Empty icon="grades" title="Nothing showcased yet." hint="Be the first. Add something you built and your cohort will see it here." />
      ) : shown.length === 0 && view === 'mine' ? (
        <Empty icon="grades" title="You haven't added anything yet." hint="Press Add your work above." />
      ) : (
        <div className="sc-list">
          {shown.map((s) => (editing && editing._id === s._id ? (
            <ShowcaseForm key={s._id} entry={s} batches={data.batches || []} onSaved={saved} onCancel={() => setEditing(null)} />
          ) : (
            <ShowcaseCard key={s._id} entry={s} onEdit={() => setEditing(s)} onRemoved={removed} />
          )))}
        </div>
      )}
    </div>
  );
}

// ── The form ────────────────────────────────────────────────────────────────
function ShowcaseForm({ entry, batches, onSaved, onCancel }) {
  const pickRef = useRef(null);
  const [batchId, setBatchId] = useState(entry?.batchId || batches[0]?._id || '');
  const [title, setTitle] = useState(entry?.title || '');
  const [description, setDescription] = useState(entry?.description || '');
  const [motive, setMotive] = useState(entry?.motive || '');
  const [links, setLinks] = useState(entry?.links?.length ? entry.links : [{ url: '', label: '' }]);
  const [driveLink, setDriveLink] = useState(entry?.driveLink || '');
  const [kept, setKept] = useState(entry?.files || []);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const room = MAX_FILES - kept.length - pending.length;

  function pick(list) {
    const files = [...(list || [])];
    if (!files.length) return;
    setErr('');
    if (files.length > room) { setErr(room > 0 ? `You can add ${room} more file${room === 1 ? '' : 's'}.` : `That is the limit of ${MAX_FILES}. Remove one to add another.`); return; }
    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) { setErr(`${tooBig.name} is over the 10 MB limit.`); return; }
    const wrong = files.find((f) => !ACCEPT_EXT.test(f.name));
    if (wrong) { setErr(`${wrong.name} is not a file type we take. Add a PDF, an image, a Word, Excel or PowerPoint file, or a text or code file.`); return; }
    setPending((p) => [...p, ...files]);
  }

  const setLink = (i, k, v) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!title.trim() || !description.trim() || !motive.trim()) { setErr('Title, what you built and why you built it are all needed.'); return; }
    setBusy(true);
    try {
      const removeFiles = entry ? entry.files.filter((f) => !kept.some((k) => k._id === f._id)).map((f) => f._id) : undefined;
      const r = await saveShowcase(entry?._id, {
        batchId: entry ? undefined : batchId,
        title: title.trim(),
        description: description.trim(),
        motive: motive.trim(),
        // No longer asked for, but an entry made while it was keeps its link.
        assignmentId: entry?.assignmentId || undefined,
        driveLink: driveLink.trim(),
        links: links.filter((l) => l.url.trim()),
        removeFiles: removeFiles?.length ? removeFiles : undefined,
      }, pending);
      onSaved(r.showcase);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel sc-form" onSubmit={submit}>
      <h3>{entry ? 'Edit your entry' : 'Add your work'}</h3>

      {!entry && batches.length > 1 && (
        <label>Batch
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {batches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </label>
      )}

      <fieldset className="sc-group">
        <legend>About the project <span className="sc-req">required</span></legend>
        <label>Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="e.g. A research agent that reads my lecture notes" />
        </label>
        <label>What you built
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} required placeholder="What it does, how it works, which tools you used." />
        </label>
        <label>Why you built it
          <textarea value={motive} onChange={(e) => setMotive(e.target.value)} rows={3} maxLength={2000} required placeholder="The problem it solves for you, or what you wanted to learn." />
        </label>
      </fieldset>

      <fieldset className="sc-group">
        <legend>Where to see it <span className="sc-opt">optional, add whatever your project has</span></legend>

        <span className="sc-label">Live links</span>
        {links.map((l, i) => (
          <div key={i} className="sc-link-row">
            <input type="url" inputMode="url" autoComplete="off" spellCheck="false" value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} placeholder="https://…" aria-label={`Link ${i + 1}`} />
            <input value={l.label} onChange={(e) => setLink(i, 'label', e.target.value)} maxLength={60} placeholder="Label, e.g. Live demo" aria-label={`Label for link ${i + 1}`} />
            {(links.length > 1 || l.url) && (
              <button type="button" className="btn sm quiet" onClick={() => setLinks((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ url: '', label: '' }]))}>Remove</button>
            )}
          </div>
        ))}
        {links.length < MAX_LINKS && (
          <button type="button" className="btn sm quiet sc-add" onClick={() => setLinks((ls) => [...ls, { url: '', label: '' }])}>Add another link</button>
        )}

        <label>Google Drive link
          <input type="url" inputMode="url" autoComplete="off" spellCheck="false" value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/…" />
        </label>
        <p className="sc-hint">Share it as “Anyone with the link can view”, or your classmates will only see a request-access page.</p>

        <span className="sc-label">Files</span>
        <p className="sc-hint">PDFs, screenshots, decks, documents or code. Up to {MAX_FILES} files, 10 MB each.</p>
        {(kept.length > 0 || pending.length > 0) && (
          <ul className="ds-files">
            {kept.map((f) => (
              <li key={f._id} className="ds-file">
                <span className="ds-file-name">{f.name}</span>
                <span className="ds-file-size">{kb(f.size)}</span>
                <button type="button" className="btn sm quiet" onClick={() => setKept((k) => k.filter((x) => x._id !== f._id))}>Remove</button>
              </li>
            ))}
            {pending.map((f, i) => (
              <li key={`${f.name}-${i}`} className="ds-file">
                <span className="ds-file-name">{f.name}</span>
                <span className="ds-file-size">{kb(f.size)} · uploads when you save</span>
                <button type="button" className="btn sm quiet" onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
        <button type="button" className="btn sm quiet sc-add" disabled={room <= 0} onClick={() => pickRef.current?.click()}>
          {kept.length + pending.length ? 'Add another file' : 'Add files'}
        </button>
      </fieldset>

      {err && <p className="sub-check-error">{err}</p>}
      <div className="sub-actions">
        <button className={`btn ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Saving…' : entry ? 'Save changes' : 'Post to showcase'}</button>
        <button type="button" className="btn quiet" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// ── One entry ───────────────────────────────────────────────────────────────
function ShowcaseCard({ entry: s, onEdit, onRemoved, canModerate = false }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function remove() {
    const who = s.mine ? 'your entry' : `${s.student?.name || 'this student'}'s entry`;
    if (!window.confirm(`Remove ${who} “${s.title}” from the showcase? This cannot be undone.`)) return;
    setBusy(true); setErr('');
    try {
      await api(`/showcases/${s._id}`, { method: 'DELETE' });
      onRemoved(s._id);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function open(f) {
    setErr('');
    try { await openStoredFile(f.url, f.name); } catch (e) { setErr(e.message); }
  }

  const hasMedia = s.links?.length || s.driveLink || s.files?.length;

  return (
    <article className="panel sc-card">
      <header className="sc-card-head">
        <div className="sc-card-copy">
          <h3 className="sc-title">{s.title}</h3>
          <div className="sc-meta">
            <span>{s.mine ? 'You' : s.student?.name || 'A classmate'}</span>
            <span>· {day(s.createdAt)}</span>
            {s.assignment && <span className="ac-type">{s.assignment.type} · {s.assignment.title}</span>}
          </div>
        </div>
        {(s.mine || canModerate) && (
          <div className="sc-card-actions">
            {s.mine && onEdit && <button type="button" className="btn sm ghost" onClick={onEdit} disabled={busy}>Edit</button>}
            <button type="button" className={`btn sm ghost-danger ${busy ? 'is-busy' : ''}`} onClick={remove} disabled={busy}>{s.mine ? 'Delete' : 'Remove'}</button>
          </div>
        )}
      </header>

      <p className="sc-text">{s.description}</p>
      <div className="sc-why">
        <span className="sc-label">Why I built it</span>
        <p className="sc-text">{s.motive}</p>
      </div>

      {hasMedia ? (
        <div className="work-files">
          {s.links.map((l, i) => (
            <a key={i} className="wchip" href={l.url} target="_blank" rel="noopener noreferrer"><LineIcon name="rocket" size={14} /> {l.label || host(l.url)}</a>
          ))}
          {s.driveLink && (
            <a className="wchip" href={s.driveLink} target="_blank" rel="noopener noreferrer"><LineIcon name="inbox" size={14} /> Google Drive</a>
          )}
          {s.files.map((f) => (
            <button key={f._id} type="button" className="wchip" onClick={() => open(f)}><LineIcon name="paperclip" size={14} /> {f.name}</button>
          ))}
        </div>
      ) : null}
      {err && <p className="sub-check-error">{err}</p>}
    </article>
  );
}

// ── The mentor's and admin's view of one batch ─────────────────────────────
/** Renders nothing for a batch that is not Kickstarter. Read-only, except that
 *  a mentor of the batch or an admin can take an entry down. */
export function ShowcasePanel({ batchId, canModerate }) {
  const { data, loading, setData } = useFetch(`/showcases?batchId=${batchId}`, { initial: null });
  if (loading || !data?.eligible) return null;
  const entries = data.showcases || [];
  const removed = (id) => setData((d) => ({ ...d, showcases: d.showcases.filter((s) => s._id !== id) }));
  return (
    <section className="panel">
      <h3>Student showcase</h3>
      <p className="muted">What students in this batch have built and chosen to show their cohort. Not graded.</p>
      {entries.length === 0
        ? <Empty inline icon="grades" title="Nothing showcased yet." hint="Students add entries from Learning → Assignments & Projects → Showcase." />
        : <div className="sc-list">{entries.map((s) => <ShowcaseCard key={s._id} entry={s} onRemoved={removed} canModerate={canModerate} />)}</div>}
    </section>
  );
}

