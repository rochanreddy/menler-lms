import { useRef, useState } from 'react';
import {
  uploadCurriculumPdf, uploadCurriculumFile, isTeacherNoteFile, TEACHER_NOTES_ACCEPT, TEACHER_NOTES_REFUSAL,
} from '../api.js';
import FileViewer from './FileViewer.jsx';
import LessonIcon from './LessonIcon.jsx';
import LineIcon from './LineIcon.jsx';
import { openOutside, opensInReader } from './ReadingPicker.jsx';

// The admin's editor for one specialisation's syllabus: modules, each with
// lessons, and on every one of them the two things a Generalist week carries
// — one reading PDF (the ebook, opened in the reader) and a list of teacher
// notes (the deck, a template, a link).
//
// Nothing here has a Save button. Every change goes through `edit(fn, delay)`
// from the page, which applies it to the draft and saves the whole syllabus
// after `delay` ms: typing waits for a pause, a structural change (add, move,
// remove, a file landing) goes at once. Files are stored the moment they are
// picked, through the same hash-deduped store as course PDFs, so a book that
// is also a Generalist ebook is one blob.
//
// New modules, lessons and files get their id here rather than on the
// server, so React keys and the next save agree about which row is which.

/** A fresh ObjectId-shaped id: 4 bytes of time, 8 random. */
export function newId() {
  const t = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const r = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  return t + r;
}

const TYPING = 900;

const move = (list, i, d) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
};

export default function SpecialisationEditor({ doc, edit }) {
  const modules = doc.modules || [];
  // Which modules are unfolded. The first is, so an empty-looking page never
  // greets someone who already built a syllabus.
  const [open, setOpen] = useState(() => new Set(modules[0] ? [modules[0]._id] : []));
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function addModule() {
    const id = newId();
    edit((d) => { d.modules.push({ _id: id, title: `Module ${d.modules.length + 1}`, summary: '', readingUrl: '', readingName: '', materials: [], lessons: [] }); });
    setOpen((s) => new Set(s).add(id));
  }

  return (
    <div className="sp-syllabus">
      {modules.length === 0 && (
        <div className="sp-start">
          <LineIcon name="list" size={18} />
          <div>
            <strong>No syllabus yet.</strong>
            <p className="muted">Add the first module — a week, a sprint, whatever the track is built in — then its lessons. Each one takes a reading PDF and teacher notes. Everything saves as you go, and students in this track see it on their Specialisation tab straight away.</p>
          </div>
        </div>
      )}

      {modules.map((m, mi) => (
        <ModuleCard
          key={m._id}
          m={m}
          mi={mi}
          count={modules.length}
          open={open.has(m._id)}
          onToggle={() => toggle(m._id)}
          edit={edit}
        />
      ))}

      <button type="button" className="btn sm ghost sp-add-module" onClick={addModule}>
        + Add module
      </button>
    </div>
  );
}

function ModuleCard({ m, mi, count, open, onToggle, edit }) {
  // By id, not by position: an upload that lands after the admin moved or
  // deleted a module must not write onto whichever module took its place.
  const on = (fn) => (d) => { const node = d.modules.find((x) => x._id === m._id); if (node) fn(node, d); };
  const lessons = m.lessons || [];
  const files = (m.readingUrl ? 1 : 0) + (m.materials || []).length;
  const [openLesson, setOpenLesson] = useState(null);

  function remove() {
    const what = [lessons.length && `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`, files && `${files} file${files === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
    if (what && !window.confirm(`Delete “${m.title}” and its ${what}?\n\nStudents in this track stop seeing it at once. The files stay in storage.`)) return;
    edit((d) => { d.modules = d.modules.filter((x) => x._id !== m._id); });
  }

  function addLesson() {
    const id = newId();
    edit(on((node) => { node.lessons.push({ _id: id, title: `Lesson ${node.lessons.length + 1}`, body: '', classLink: '', readingUrl: '', readingName: '', materials: [] }); }));
    if (!open) onToggle();
    setOpenLesson(id);
  }

  return (
    <section className={`sp-mod ${open ? 'open' : ''}`}>
      <div className="sp-mod-head">
        <button type="button" className="sp-fold" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Fold module' : 'Unfold module'}>
          <LineIcon name="chevron" size={14} />
        </button>
        <span className="sp-kicker">Module {mi + 1}</span>
        <input
          className="ce-field sp-title-input"
          value={m.title}
          aria-label={`Module ${mi + 1} title`}
          onChange={(e) => { const v = e.target.value; edit(on((node) => { node.title = v; }), TYPING); }}
          onBlur={() => edit(null, 0)}
        />
        {!open && <span className="muted sp-mod-count">{lessons.length} lesson{lessons.length === 1 ? '' : 's'}{files ? ` · ${files} file${files === 1 ? '' : 's'}` : ''}</span>}
        <span className="sp-order">
          <button type="button" className="icon-btn sm" title="Move up" disabled={mi === 0} onClick={() => edit((d) => move(d.modules, mi, -1))}>↑</button>
          <button type="button" className="icon-btn sm" title="Move down" disabled={mi === count - 1} onClick={() => edit((d) => move(d.modules, mi, 1))}>↓</button>
          <button type="button" className="icon-btn sm sp-del" title="Delete module" onClick={remove}><LineIcon name="close" size={14} /></button>
        </span>
      </div>

      {open && (
        <div className="sp-mod-body">
          <label className="ce-label">Summary <span className="muted">(optional · Markdown · shown above the lessons)</span></label>
          <textarea
            className="ce-field"
            rows={3}
            value={m.summary || ''}
            placeholder="What this module covers, and what a student can do by the end of it."
            onChange={(e) => { const v = e.target.value; edit(on((node) => { node.summary = v; }), TYPING); }}
            onBlur={() => edit(null, 0)}
          />

          <div className="sp-files-grid">
            <ReadingSlot
              node={m}
              hint="Every lesson in this module opens it, unless the lesson has its own."
              onSet={(url, name) => edit(on((node) => { node.readingUrl = url; node.readingName = name; }))}
            />
            <NotesEditor
              items={m.materials || []}
              label="Teacher notes"
              hint="Listed on every lesson in this module."
              onChange={(fn) => edit(on((node) => fn(node.materials)))}
            />
          </div>

          <div className="sp-lessons">
            <div className="sp-lessons-head">
              <span className="ce-label">Lessons</span>
            </div>
            {lessons.length === 0 && <p className="muted sp-none">No lessons in this module yet.</p>}
            {lessons.map((l, li) => (
              <LessonRow
                key={l._id}
                l={l}
                li={li}
                count={lessons.length}
                open={openLesson === l._id}
                onToggle={() => setOpenLesson((x) => (x === l._id ? null : l._id))}
                edit={(fn, delay) => edit(fn && on((node) => fn(node.lessons)), delay)}
                moduleReading={!!m.readingUrl}
              />
            ))}
            <button type="button" className="btn sm quiet" onClick={addLesson}>+ Add lesson</button>
          </div>
        </div>
      )}
    </section>
  );
}

function LessonRow({ l, li, count, open, onToggle, edit, moduleReading }) {
  const files = (l.readingUrl ? 1 : 0) + (l.materials || []).length;
  // By id, for the same reason as the module's.
  const on = (fn) => (lessons) => { const node = lessons.find((x) => x._id === l._id); if (node) fn(node); };

  function remove() {
    if ((l.body || files) && !window.confirm(`Delete the lesson “${l.title}”?`)) return;
    edit((lessons) => { const i = lessons.findIndex((x) => x._id === l._id); if (i >= 0) lessons.splice(i, 1); });
  }

  return (
    <div className={`sp-lesson ${open ? 'open' : ''}`}>
      <div className="sp-lesson-head">
        <button type="button" className="sp-fold" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Fold lesson' : 'Edit lesson'}>
          <LineIcon name="chevron" size={13} />
        </button>
        <span className="sp-lesson-n">{li + 1}</span>
        <input
          className="ce-field sp-title-input"
          value={l.title}
          aria-label={`Lesson ${li + 1} title`}
          onChange={(e) => { const v = e.target.value; edit(on((node) => { node.title = v; }), TYPING); }}
          onBlur={() => edit(null, 0)}
        />
        {!open && (
          <span className="sp-lesson-tags">
            {l.body && <span className="badge badge-muted">text</span>}
            {l.classLink && <span className="badge badge-muted">video</span>}
            {files > 0 && <span className="badge badge-muted">{files} file{files === 1 ? '' : 's'}</span>}
          </span>
        )}
        <span className="sp-order">
          <button type="button" className="icon-btn sm" title="Move up" disabled={li === 0} onClick={() => edit((lessons) => move(lessons, li, -1))}>↑</button>
          <button type="button" className="icon-btn sm" title="Move down" disabled={li === count - 1} onClick={() => edit((lessons) => move(lessons, li, 1))}>↓</button>
          <button type="button" className="icon-btn sm sp-del" title="Delete lesson" onClick={remove}><LineIcon name="close" size={13} /></button>
        </span>
      </div>

      {open && (
        <div className="sp-lesson-body">
          <label className="ce-label">Lesson text <span className="muted">(Markdown)</span></label>
          <textarea
            className="ce-field"
            rows={6}
            value={l.body || ''}
            placeholder="What the student reads when they open this lesson."
            onChange={(e) => { const v = e.target.value; edit(on((node) => { node.body = v; }), TYPING); }}
            onBlur={() => edit(null, 0)}
          />
          <label className="ce-label">Class link <span className="muted">(the live class, or its recording · Drive must be “Anyone with the link → Viewer”)</span></label>
          <input
            className="ce-field"
            value={l.classLink || ''}
            placeholder="https://…"
            onChange={(e) => { const v = e.target.value; edit(on((node) => { node.classLink = v; }), TYPING); }}
            onBlur={() => edit(null, 0)}
          />
          <div className="sp-files-grid">
            <ReadingSlot
              node={l}
              hint={moduleReading ? 'Empty: the lesson opens its module’s reading.' : 'Only if this lesson needs its own book.'}
              onSet={(url, name) => edit(on((node) => { node.readingUrl = url; node.readingName = name; }))}
            />
            <NotesEditor
              items={l.materials || []}
              label="Teacher notes"
              hint="Shown with the module’s notes."
              onChange={(fn) => edit(on((node) => fn(node.materials)))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// The ebook slot: one PDF, opened in the reader. A PDF because that is what
// the reader shows; anything else belongs under teacher notes.
export function ReadingSlot({ node, hint, onSet }) {
  const pick = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [viewer, setViewer] = useState(null);

  async function take(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { setErr('Reading material must be a PDF. Put other files under Teacher notes.'); return; }
    setBusy(true);
    setErr('');
    try {
      const { url, name } = await uploadCurriculumPdf(file);
      onSet(url, name || file.name);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const name = node.readingName || 'Reading material';
  return (
    <div className="sp-slot">
      <span className="ce-label">Reading material</span>
      {node.readingUrl ? (
        <div className="mm-files">
          <span className="mm-file is-ebook">
            <button type="button" className="sp-file-open" onClick={() => setViewer({ label: 'Reading material', subtitle: name, url: node.readingUrl })}>
              <LessonIcon type="pdf" size={13} /> <span className="mm-file-name" title={name}>{name}</span>
            </button>
            <button type="button" className="mm-file-x" aria-label="Remove the reading" onClick={() => onSet('', '')}><LineIcon name="close" size={12} /></button>
          </span>
        </div>
      ) : (
        <>
          <button type="button" className={`btn sm quiet ${busy ? 'is-busy' : ''}`} disabled={busy} onClick={() => pick.current?.click()}>
            <LineIcon name="upload" size={14} /> {busy ? 'Uploading…' : 'Attach PDF'}
          </button>
          {hint && <p className="muted sp-hint">{hint}</p>}
        </>
      )}
      <input ref={pick} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      {err && <p className="pdf-err">{err}</p>}
      {viewer && <FileViewer {...viewer} allowNewTab onClose={() => setViewer(null)} />}
    </div>
  );
}

// A list of teacher notes: several files at once, any format the store takes,
// filed as Notes (the deck, what was taught) or Resources (a notice, a
// template). `onChange(fn)` gets a function that mutates the list in place.
export function NotesEditor({ items, label, hint, onChange }) {
  const pick = useRef(null);
  const pickKind = useRef('notes');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkKind, setLinkKind] = useState('notes');
  const [drag, setDrag] = useState(false);
  const [pending, setPending] = useState(null); // dropped files, waiting to be told what they are
  const [viewer, setViewer] = useState(null);

  async function take(fileList, kind) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const refused = files.find((f) => !isTeacherNoteFile(f));
    if (refused) { setErr(`${refused.name} can't be added. ${TEACHER_NOTES_REFUSAL}`); return; }
    setBusy(true);
    setErr('');
    const added = [];
    try {
      // One at a time: the store is the database, and twenty parallel 15 MB
      // writes are how a free-tier cluster says no.
      for (const f of files) {
        const { url, name } = await uploadCurriculumFile(f);
        added.push({ _id: newId(), url, name: name || f.name, kind, addedAt: new Date().toISOString() });
      }
    } catch (e) {
      setErr(`${e.message}${added.length ? ` (${added.length} of ${files.length} were added)` : ''}`);
    } finally {
      // Whatever made it is kept even if a later file failed.
      if (added.length) onChange((list) => { for (const a of added) if (!list.some((x) => x.url === a.url)) list.push(a); });
      setBusy(false);
    }
  }

  function addLink(e) {
    e.preventDefault();
    const url = link.trim();
    if (!url) return;
    if (!/^https?:\/\/\S+$/i.test(url)) { setErr('That link must start with https://.'); return; }
    setErr('');
    onChange((list) => { if (!list.some((x) => x.url === url)) list.push({ _id: newId(), url, name: linkName.trim() || url, kind: linkKind, addedAt: new Date().toISOString() }); });
    setLink(''); setLinkName(''); setLinking(false);
  }

  const open = (x) => {
    if (opensInReader(x.url, x.name)) setViewer({ label, subtitle: x.name || x.url, url: x.url });
    else openOutside(x);
  };

  return (
    <div
      className={`sp-slot sp-notes ${drag ? 'drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const fs = Array.from(e.dataTransfer.files || []); if (fs.length) setPending(fs); }}
    >
      <span className="ce-label">{label}</span>
      {items.length > 0 && (
        <div className="mm-files">
          {items.map((x) => (
            <span className={`mm-file ${x.kind === 'resource' ? 'is-resource' : ''}`} key={x._id || x.url}>
              <button type="button" className="sp-file-open" onClick={() => open(x)}>
                <LessonIcon type={opensInReader(x.url, x.name) ? 'pdf' : 'text'} size={13} />
                <span className="mm-file-name" title={x.name || x.url}>{x.name || x.url}</span>
              </button>
              <button
                type="button"
                className="mm-file-kind is-btn"
                title="Switch between Notes and Resource"
                onClick={() => onChange((list) => { const it = list.find((y) => y.url === x.url); if (it) it.kind = it.kind === 'resource' ? 'notes' : 'resource'; })}
              >
                {x.kind === 'resource' ? 'resource' : 'notes'}
              </button>
              <button type="button" className="mm-file-x" aria-label={`Remove ${x.name || 'file'}`} onClick={() => onChange((list) => { const i = list.findIndex((y) => y.url === x.url); if (i >= 0) list.splice(i, 1); })}>
                <LineIcon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {pending && (
        <div className="mm-ask">
          <span>{pending.length === 1 ? pending[0].name : `${pending.length} files`} — what are they?</span>
          <button type="button" className="btn sm" onClick={() => { const fs = pending; setPending(null); take(fs, 'notes'); }}>Notes</button>
          <button type="button" className="btn sm quiet" onClick={() => { const fs = pending; setPending(null); take(fs, 'resource'); }}>Resources</button>
          <button type="button" className="mm-linkbtn" onClick={() => setPending(null)}>cancel</button>
        </div>
      )}

      <div className="sp-notes-add">
        <button type="button" className={`btn sm quiet ${busy ? 'is-busy' : ''}`} disabled={busy} onClick={() => { pickKind.current = 'notes'; pick.current?.click(); }} title="The deck, what was taught">
          <LineIcon name="upload" size={14} /> {busy ? 'Uploading…' : 'Add notes'}
        </button>
        <button type="button" className="btn sm quiet" disabled={busy} onClick={() => { pickKind.current = 'resource'; pick.current?.click(); }} title="A notice, a template, further reading">
          Add resources
        </button>
        <button type="button" className="mm-linkbtn" onClick={() => setLinking((v) => !v)} disabled={busy}>{linking ? 'cancel' : 'or a link'}</button>
      </div>
      {!items.length && hint && <p className="muted sp-hint">{hint} Drop files here too.</p>}

      {linking && (
        <form className="mm-linkform" onSubmit={addLink}>
          <input className="ce-field" placeholder="https://… (Drive set to Anyone with the link)" value={link} onChange={(e) => setLink(e.target.value)} autoFocus />
          <input className="ce-field" placeholder="What to call it (optional)" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          <select className="ce-field mm-kind-select" value={linkKind} onChange={(e) => setLinkKind(e.target.value)} aria-label="Notes or resource">
            <option value="notes">Notes</option>
            <option value="resource">Resource</option>
          </select>
          <button className="btn sm" disabled={!link.trim()}>Add link</button>
        </form>
      )}

      <input ref={pick} type="file" accept={TEACHER_NOTES_ACCEPT} multiple hidden onChange={(e) => { take(e.target.files, pickKind.current); e.target.value = ''; }} />
      {err && <p className="pdf-err">{err}</p>}
      {viewer && <FileViewer {...viewer} allowNewTab onClose={() => setViewer(null)} />}
    </div>
  );
}
