import { useEffect, useRef, useState } from 'react';
import { api, addMaterials, removeMaterial, isStoredFile } from '../api.js';
import Empty, { Loading } from './Empty.jsx';
import LessonIcon from './LessonIcon.jsx';
import LineIcon from './LineIcon.jsx';
import { tierNames } from '../features.js';

// Teacher notes, the mentor's way in.
//
// The curriculum editor is a tree with a Save button, three PDF slots per
// node and a Markdown body — the right tool for the admin who builds the
// course, and the wrong one for a mentor whose whole job on this screen is
// "put Tuesday's handouts up". So this page is just the course, week by week,
// and every week, session and lesson is a row you drop PDFs on. Several at
// once. Each drop saves straight away (POST /programs/:id/materials), so
// there is nothing to remember to press afterwards.
//
// The student's Teacher notes chip lists everything on the lesson, its
// session and its week, so the mentor never copies anything onto a lesson.
// Notes, not reading: the reading is the ebook the admin attached in the
// editor, and what a mentor puts up — the deck, a notice — is the notes.
// A mentor teaches a class in one sitting, so the class is the drop target
// and nothing smaller is offered: one row per module, which is a session on
// Kickstarter (S01 · …) and a week on Generalist (one four-hour class a
// week, not one per S1/S2 chapter). Assignments are the exception on the
// student side — they keep their own brief and do not list the class's
// handouts. Per-lesson and per-chapter files still exist for the admin, in
// the curriculum editor.
//
// Admins get the same page from Programs, because it is the faster way to do
// this for them too; the editor stays for everything else.
export default function MaterialsManager({ programId, onClose }) {
  const [program, setProgram] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  // Which weeks are unfolded. The first is open on arrival so the page is
  // never a list of six closed headings; the rest open on tap.
  const [open, setOpen] = useState(() => new Set([0]));

  useEffect(() => {
    api(`/programs/${programId}`)
      .then(({ program: p }) => setProgram(p))
      .catch((e) => setError(e.message));
  }, [programId]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  // Replace one node's list in local state once the server has answered.
  const setNodeMaterials = ({ mi, ci, ti }, materials) => setProgram((p) => {
    const next = structuredClone(p);
    const node = ti !== undefined ? next.modules[mi].chapters[ci].topics[ti]
      : ci !== undefined ? next.modules[mi].chapters[ci]
        : next.modules[mi];
    node.materials = materials;
    return next;
  });

  const idsFor = ({ mi, ci, ti }) => {
    const m = program.modules[mi];
    const c = ci !== undefined ? m.chapters[ci] : null;
    const t = ti !== undefined ? c.topics[ti] : null;
    return { moduleId: m._id, chapterId: c?._id, topicId: t?._id };
  };

  async function push(pos, files, link, label, kind) {
    const { materials, added } = await addMaterials(programId, idsFor(pos), files, link, kind);
    setNodeMaterials(pos, materials);
    const n = added;
    const what = kind === 'resource' ? (n === 1 ? 'resource' : 'resources') : (n === 1 ? 'notes file' : 'notes files');
    flash(n === 0 ? 'Already attached there.' : `Added ${n} ${what} to ${label}. Students can open ${n === 1 ? 'it' : 'them'} now.`);
  }

  async function remove(pos, material) {
    const { materials } = await removeMaterial(programId, material._id);
    setNodeMaterials(pos, materials);
    flash(`Removed ${material.name || 'the file'}.`);
  }

  const toggle = (mi) => setOpen((s) => { const n = new Set(s); if (n.has(mi)) n.delete(mi); else n.add(mi); return n; });
  const countUnder = (m) => (m.materials || []).length + (m.chapters || []).reduce((k, c) => k + (c.materials || []).length + (c.topics || []).reduce((j, t) => j + (t.materials || []).length, 0), 0);

  if (error) return <div className="panel"><Empty icon="programs" title="Couldn’t open this programme." hint={error} /></div>;
  if (!program) return <div className="panel"><Loading rows={4} /></div>;

  return (
    <div className="mm">
      <div className="ce-bar">
        <button className="btn ghost sm" onClick={onClose}>← Programs</button>
        <div className="ce-bar-title">
          <strong>{program.title}</strong>
          <span className="muted">· Teacher notes</span>
        </div>
        {msg && <span className="muted ce-msg mm-msg">{msg}</span>}
      </div>

      <div className="mm-intro">
        <LineIcon name="upload" size={18} />
        <div>
          <strong>Drop a class’s notes on the class.</strong>
          <p className="muted">Several PDFs at a time, as <b>Notes</b> (the deck, what was taught) or <b>Resources</b> (a notice, a template, further reading). Each one saves the moment it lands, and every lesson in that session or week lists it under <b>Teacher notes</b>, in those two groups — except the assignments, which keep their own. The ebook under <b>Reading material</b> stays as the admin set it.</p>
        </div>
      </div>

      {(program.modules || []).length === 0 && (
        <Empty icon="learning" title="This programme has no weeks yet." hint="An admin builds the curriculum under Programs → Manage curriculum; the rows to drop files on appear here once it exists." />
      )}

      {(program.modules || []).map((m, mi) => {
        const isOpen = open.has(mi);
        const under = countUnder(m);
        const names = tierNames(m.title);
        return (
          <section className={`mm-week ${isOpen ? 'open' : ''}`} key={m._id || mi}>
            <button type="button" className="mm-week-head" onClick={() => toggle(mi)} aria-expanded={isOpen}>
              <span className="mm-week-chev"><LineIcon name="chevron" size={14} /></span>
              <span className="mm-week-title">{m.title}</span>
              <span className="muted mm-week-count">{under === 0 ? 'no files yet' : `${under} ${under === 1 ? 'file' : 'files'}`}</span>
            </button>

            {isOpen && (
              <div className="mm-week-body">
                <MaterialRow
                  kind="week"
                  label={names.top}
                  title={names.topWhole}
                  hint={`Every lesson in this ${names.top.toLowerCase()} lists these, except the assignments.`}
                  ebook={m.notesUrl}
                  materials={m.materials || []}
                  onAdd={(files, link, kind) => push({ mi }, files, link, m.title, kind)}
                  onRemove={(x) => remove({ mi }, x)}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// One drop target. The same component for a week, a session and a lesson,
// so the gesture is the same everywhere: drop, or press Add PDFs, and the
// files appear as chips with a ✕. The week's or session's own notes slot
// (set by the admin in the editor) is shown as the first chip so the mentor
// can see students already have it, but it is not theirs to remove from here.
function MaterialRow({ kind, label, title, hint, ebook, materials, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkKind, setLinkKind] = useState('notes');
  // Which button opened the file picker, so the files it returns are filed
  // as that. A drop with no button pressed lands as notes — the common case.
  const pickKind = useRef('notes');
  // Files dropped on the row rather than picked: ask, because a drop has no
  // button to say which it is.
  const [pending, setPending] = useState(null); // File[]

  async function take(fileList, kind) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const notPdf = files.find((f) => !/\.pdf$/i.test(f.name) && f.type !== 'application/pdf');
    if (notPdf) { setErr(`${notPdf.name} is not a PDF. Only PDF files are accepted.`); return; }
    setErr('');
    setBusy(true);
    try { await onAdd(files, null, kind); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const pick = (kind) => { pickKind.current = kind; inputRef.current?.click(); };

  async function addLink(e) {
    e.preventDefault();
    const url = link.trim();
    if (!url) return;
    setErr('');
    setBusy(true);
    try {
      await onAdd([], { url, name: linkName.trim() || url }, linkKind);
      setLink(''); setLinkName(''); setLinking(false);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function drop(x) {
    setErr('');
    setBusy(true);
    try { await onRemove(x); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }


  return (
    <div
      className={`mm-row mm-row-${kind} ${drag ? 'drag' : ''} ${busy ? 'busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const fs = Array.from(e.dataTransfer.files || []); if (fs.length) setPending(fs); }}
    >
      <div className="mm-row-head">
        <span className={`mm-kind mm-kind-${kind}`}>{label}</span>
        <span className="mm-row-title" title={title}>{title}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          hidden
          onChange={(e) => { take(e.target.files, pickKind.current); e.target.value = ''; }}
        />
        <button type="button" className="btn sm mm-add" onClick={() => pick('notes')} disabled={busy} title="The deck, what was taught">
          <LineIcon name="upload" size={14} /> {busy ? 'Saving…' : 'Add notes'}
        </button>
        <button type="button" className="btn sm quiet mm-add" onClick={() => pick('resource')} disabled={busy} title="A notice, a template, further reading">
          <LineIcon name="upload" size={14} /> Add resources
        </button>
        <button type="button" className="mm-linkbtn" onClick={() => setLinking((v) => !v)} disabled={busy} title="Add a link instead of a file">
          {linking ? 'cancel' : 'or a link'}
        </button>
      </div>
      {hint && !materials.length && !ebook && <p className="muted mm-row-hint">{hint} Drop files here, or press Add notes / Add resources.</p>}

      {/* A drop has no button behind it, so ask before filing it. */}
      {pending && (
        <div className="mm-ask">
          <span>{pending.length === 1 ? pending[0].name : `${pending.length} files`} — what are they?</span>
          <button type="button" className="btn sm" onClick={() => { const fs = pending; setPending(null); take(fs, 'notes'); }}>Notes</button>
          <button type="button" className="btn sm quiet" onClick={() => { const fs = pending; setPending(null); take(fs, 'resource'); }}>Resources</button>
          <button type="button" className="mm-linkbtn" onClick={() => setPending(null)}>cancel</button>
        </div>
      )}

      {linking && (
        <form className="mm-linkform" onSubmit={addLink}>
          <input className="ce-field" placeholder="https://… (a PDF link, a Drive file set to Anyone with the link)" value={link} onChange={(e) => setLink(e.target.value)} autoFocus />
          <input className="ce-field" placeholder="What to call it (optional)" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          <select className="ce-field mm-kind-select" value={linkKind} onChange={(e) => setLinkKind(e.target.value)} aria-label="Notes or resource">
            <option value="notes">Notes</option>
            <option value="resource">Resource</option>
          </select>
          <button className="btn sm" disabled={busy || !link.trim()}>Add link</button>
        </form>
      )}

      {(ebook || materials.length > 0) && (
        <div className="mm-files">
          {ebook && (
            <span className="mm-file is-ebook" title="The notes the admin attached in the curriculum editor. Students see them first.">
              <LessonIcon type="pdf" size={13} /> Notes <span className="muted">· from the editor</span>
            </span>
          )}
          {materials.map((x) => (
            <span className={`mm-file ${x.kind === 'resource' ? 'is-resource' : ''}`} key={x._id || x.url}>
              <LessonIcon type={isStoredFile(x.url) || /\.pdf(\?|#|$)/i.test(x.url) ? 'pdf' : 'text'} size={13} />
              <span className="mm-file-name" title={x.name || x.url}>{x.name || x.url}</span>
              <span className="mm-file-kind">{x.kind === 'resource' ? 'resource' : 'notes'}</span>
              <button type="button" className="mm-file-x" onClick={() => drop(x)} aria-label={`Remove ${x.name || 'file'}`} disabled={busy}><LineIcon name="close" size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {err && <p className="pdf-err">{err}</p>}
    </div>
  );
}
