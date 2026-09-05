import { useEffect, useMemo, useRef, useState } from 'react';
import { api, postFile, uploadCurriculumPdf, isStoredFile, getLessonVideos, setLessonVideo, clearLessonVideo } from '../api.js';
import Empty from './Empty.jsx';
import LessonIcon from './LessonIcon.jsx';
import LineIcon from './LineIcon.jsx';
import VdoCipherPicker from './VdoCipherPicker.jsx';
import useMediaQuery, { MOBILE } from '../useMediaQuery.js';

// Admin curriculum builder for one program. Upload a doc to auto-structure it,
// then review/edit the Module → Chapter → Topic tree and publish.
//
// Opened two ways from the Programs page. Without `batch` it edits what every
// cohort shares — lesson titles, PDFs, notes, the tree itself. With a `batch`
// it is scoped to that one cohort, and the lesson video slot appears: videos
// are attached per batch (server/models/BatchLessonVideo.js), so September's
// students never see October's recordings.
export default function CurriculumEditor({ programId, batch, onClose }) {
  const [program, setProgram] = useState(null);
  const [modules, setModules] = useState([]);
  const [published, setPublished] = useState(false);
  const [sel, setSel] = useState(null); // { mi, ci, ti }
  // On a phone the tree is the page and the lesson form opens over it as a
  // bottom sheet — the form used to sit under a hundred lessons of tree.
  const isMobile = useMediaQuery(MOBILE);
  const sheet = isMobile && !!sel;
  useEffect(() => {
    if (!sheet) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [sheet]);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api(`/programs/${programId}`).then(({ program: p }) => {
      setProgram(p);
      setModules(structuredClone(p.modules || []));
      setPublished(!!p.published);
    }).catch(() => {});
  }, [programId]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  // Immutable tree edit: clone, mutate via callback, mark dirty.
  const edit = (fn) => setModules((prev) => { const next = structuredClone(prev); fn(next); return next; });
  const touch = (fn) => { edit(fn); setDirty(true); };

  const stats = useMemo(() => {
    const topics = modules.reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0);
    return { modules: modules.length, topics };
  }, [modules]);

  // ── Tree mutators ──
  const addModule = () => touch((m) => m.push({ title: 'New module', order: m.length, chapters: [] }));
  const addChapter = (mi) => touch((m) => m[mi].chapters.push({ title: 'New chapter', order: m[mi].chapters.length, topics: [] }));
  const addTopic = (mi, ci) => touch((m) => m[mi].chapters[ci].topics.push({ title: 'New lesson', contentType: 'text', contentUrl: '', body: '', classLink: '', readingUrl: '', notesUrl: '', order: m[mi].chapters[ci].topics.length }));
  const delModule = (mi) => { touch((m) => m.splice(mi, 1)); setSel(null); };
  const delChapter = (mi, ci) => { touch((m) => m[mi].chapters.splice(ci, 1)); setSel(null); };
  const delTopic = (mi, ci, ti) => { touch((m) => m[mi].chapters[ci].topics.splice(ti, 1)); setSel(null); };
  const setModuleTitle = (mi, v) => touch((m) => { m[mi].title = v; });
  const setChapterTitle = (mi, ci, v) => touch((m) => { m[mi].chapters[ci].title = v; });
  const setTopicField = (mi, ci, ti, patch) => touch((m) => {
    m[mi].chapters[ci].topics[ti] = { ...m[mi].chapters[ci].topics[ti], ...patch };
  });
  const move = (mi, dir) => touch((m) => { const j = mi + dir; if (j < 0 || j >= m.length) return; [m[mi], m[j]] = [m[j], m[mi]]; });

  async function onImport(e) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const { modules: parsed, stats: st } = await postFile(`/programs/${programId}/import`, file);
      touch((m) => { parsed.forEach((pm) => m.push({ ...pm, order: m.length })); });
      flash(`Imported ${st.modules} module(s), ${st.topics} lesson(s) from ${file.name}`);
    } catch (err) { flash(err.message); }
    finally { setImporting(false); }
  }

  async function save() {
    try {
      await api(`/programs/${programId}`, { method: 'PATCH', body: { modules, published } });
      setDirty(false); flash('Curriculum saved. Students see it now.');
    } catch (err) { flash(err.message); }
  }

  if (!program) return <div className="panel">Loading…</div>;
  const selTopic = sel ? modules[sel.mi]?.chapters[sel.ci]?.topics[sel.ti] : null;

  return (
    <div className={`ce ${sheet ? 'ce-sheet-open' : ''}`}>
      <div className="ce-bar">
        <button className="btn ghost sm" onClick={onClose}>← Programs</button>
        <div className="ce-bar-title">
          <strong>{batch ? batch.name : program.title}</strong>
          <span className="muted">· {stats.modules} modules · {stats.topics} lessons</span>
        </div>
        <label className="ce-pub"><input type="checkbox" checked={published} onChange={(e) => { setPublished(e.target.checked); setDirty(true); }} /> Published</label>
        {msg && <span className="muted ce-msg">{msg}</span>}
        <button className="btn" onClick={save} disabled={!dirty}>{dirty ? 'Save changes' : 'Saved'}</button>
      </div>

      <div className="ce-import">
        <div>
          <strong className="ce-import-title"><LineIcon name="upload" size={16} /> Import from a document</strong>
          <p className="muted" style={{ margin: '2px 0 0' }}>Upload a <b>.docx</b>, <b>.pdf</b>, <b>.md</b> or <b>.txt</b>. Headings become modules & lessons automatically. Review below, then Save.</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".docx,.pdf,.md,.txt,.markdown" onChange={onImport} hidden />
          <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={importing}>{importing ? 'Reading…' : 'Choose file'}</button>
        </div>
      </div>

      <div className="ce-grid">
        <aside className="ce-tree">
          {modules.length === 0 && <Empty inline icon="learning" title="No content yet." hint="Import a document above, or add a module by hand." />}
          {modules.map((m, mi) => (
            <div key={mi} className="ce-mod">
              <div className="ce-mod-head">
                <input className="ce-mod-input" value={m.title} onChange={(e) => setModuleTitle(mi, e.target.value)} />
                <button className="ce-mini" title="Move up" onClick={() => move(mi, -1)}>↑</button>
                <button className="ce-mini" title="Move down" onClick={() => move(mi, 1)}>↓</button>
                <button className="ce-mini danger" title="Delete module" onClick={() => delModule(mi)}>✕</button>
              </div>
              {(m.chapters || []).map((c, ci) => (
                <div key={ci} className="ce-chap">
                  <div className="ce-chap-head">
                    <input className="ce-chap-input" value={c.title} onChange={(e) => setChapterTitle(mi, ci, e.target.value)} />
                    <button className="ce-mini danger" title="Delete chapter" onClick={() => delChapter(mi, ci)}>✕</button>
                  </div>
                  {(c.topics || []).map((t, ti) => {
                    const active = sel && sel.mi === mi && sel.ci === ci && sel.ti === ti;
                    return (
                      <div key={ti} className={`ce-topic ${active ? 'active' : ''}`} onClick={() => setSel({ mi, ci, ti })}>
                        <span className="ce-topic-type"><LessonIcon type={t.contentType} size={13} /></span>
                        <span className="ce-topic-title">{t.title || 'Untitled'}</span>
                        <button className="ce-mini danger" title="Delete lesson" onClick={(e) => { e.stopPropagation(); delTopic(mi, ci, ti); }}>✕</button>
                      </div>
                    );
                  })}
                  <button className="ce-add" onClick={() => addTopic(mi, ci)}>+ lesson</button>
                </div>
              ))}
              <button className="ce-add" onClick={() => addChapter(mi)}>+ chapter</button>
            </div>
          ))}
          <button className="btn ghost sm ce-addmod" onClick={addModule}>+ Add module</button>
        </aside>

        {/* Phones: the scrim behind the lesson sheet. */}
        <div className="ce-backdrop" onClick={() => setSel(null)} aria-hidden="true" />
        <section className="ce-editor panel">
          {selTopic && (
            <div className="ce-sheet-head">
              <strong>Edit lesson</strong>
              <button type="button" className="rail-toggle" onClick={() => setSel(null)} aria-label="Close"><LineIcon name="close" size={15} /></button>
            </div>
          )}
          {!selTopic ? (
            <div className="empty-state"><p className="muted">Select a lesson to edit its content, or import a document above.</p></div>
          ) : (
            <>
              <label className="ce-label">Lesson title</label>
              <input className="ce-field" value={selTopic.title} onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { title: e.target.value })} />

              <label className="ce-label">Type</label>
              <div className="ce-types">
                {['text', 'video', 'pdf'].map((tp) => (
                  <button key={tp} className={`ce-type ${selTopic.contentType === tp ? 'on' : ''}`} onClick={() => setTopicField(sel.mi, sel.ci, sel.ti, { contentType: tp })}>
                    <LessonIcon type={tp} size={14} /> {tp === 'video' ? 'Video' : tp === 'pdf' ? 'PDF' : 'Reading'}
                  </button>
                ))}
              </div>

              {selTopic.contentType === 'pdf' && (
                <>
                  <label className="ce-label">Lesson PDF</label>
                  <PdfUrlField
                    key={`${sel.mi}-${sel.ci}-${sel.ti}-content`}
                    fieldKey={`${sel.mi}-${sel.ci}-${sel.ti}-content`}
                    value={selTopic.contentUrl}
                    onChange={(contentUrl) => setTopicField(sel.mi, sel.ci, sel.ti, { contentUrl })}
                  />
                </>
              )}

              {selTopic.contentType === 'video' && (
                batch ? (
                  <LessonVideoPicker
                    key={`${batch.id}-${selTopic._id || `${sel.mi}-${sel.ci}-${sel.ti}`}`}
                    topic={selTopic}
                    batch={batch}
                  />
                ) : (
                  <>
                    <label className="ce-label">Lesson video</label>
                    <p className="muted">
                      Videos are set per batch, so each cohort watches its own recording. Go back to
                      Programs and open this lesson from a batch, “{program.title} · Sept 2026”, say,
                      to attach one.
                    </p>
                  </>
                )
              )}

              {/* Independent of content type — a reading lesson can still have
                  had a live class about it. */}
              <label className="ce-label">Class link <span className="muted">(Zoom while it's live, YouTube once recorded. Leave empty and students see "Not available yet")</span></label>
              <input
                className="ce-field"
                placeholder="https://zoom.us/j/… or https://youtube.com/watch?v=…"
                value={selTopic.classLink || ''}
                onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { classLink: e.target.value })}
              />

              <label className="ce-label">Reading material <span className="muted">(PDF, opens in the in-page viewer)</span></label>
              <PdfUrlField
                key={`${sel.mi}-${sel.ci}-${sel.ti}-reading`}
                fieldKey={`${sel.mi}-${sel.ci}-${sel.ti}-reading`}
                value={selTopic.readingUrl || ''}
                onChange={(readingUrl) => setTopicField(sel.mi, sel.ci, sel.ti, { readingUrl })}
              />

              <label className="ce-label">Teacher notes <span className="muted">(PDF, opens in the in-page viewer)</span></label>
              <PdfUrlField
                key={`${sel.mi}-${sel.ci}-${sel.ti}-notes`}
                fieldKey={`${sel.mi}-${sel.ci}-${sel.ti}-notes`}
                value={selTopic.notesUrl || ''}
                onChange={(notesUrl) => setTopicField(sel.mi, sel.ci, sel.ti, { notesUrl })}
              />

              <label className="ce-label">Content <span className="muted">(Markdown, # headings, **bold**, - lists, `code`)</span></label>
              <textarea className="ce-body" rows={16} value={selTopic.body} onChange={(e) => setTopicField(sel.mi, sel.ci, sel.ti, { body: e.target.value })} placeholder="Write the lesson content here…" />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// Drop a PDF or paste a link. Uploaded files land in Mongo and the stored
// `/uploads/…` path is what students read through the in-app PDF viewer.
function PdfUrlField({ value, onChange, fieldKey }) {
  const inputRef = useRef(null);
  const aliveRef = useRef(true);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    aliveRef.current = true;
    setFileName('');
    setErr('');
    return () => { aliveRef.current = false; };
  }, [fieldKey]);

  async function take(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setErr('Only PDF files are accepted.');
      return;
    }
    setErr('');
    setUploading(true);
    const slot = fieldKey;
    try {
      const { url, name } = await uploadCurriculumPdf(file);
      if (!aliveRef.current || slot !== fieldKey) return;
      setFileName(name || file.name);
      onChange(url);
    } catch (e) {
      if (aliveRef.current) setErr(e.message);
    } finally {
      if (aliveRef.current) setUploading(false);
    }
  }

  function onPick(e) {
    take(e.target.files?.[0]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDrag(false);
    take(e.dataTransfer.files?.[0]);
  }

  const stored = isStoredFile(value);

  return (
    <div className="pdf-field">
      <div
        className={`pdf-drop ${drag ? 'drag' : ''} ${uploading ? 'busy' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" onChange={onPick} hidden />
        <LineIcon name="upload" size={20} />
        <div>
          <strong>{uploading ? 'Uploading…' : 'Drop a PDF here'}</strong>
          <p className="muted">or <button type="button" className="pdf-browse" onClick={() => inputRef.current?.click()} disabled={uploading}>browse</button> · up to 15 MB</p>
        </div>
      </div>

      {stored ? (
        <div className="pdf-attached">
          <span className="pdf-attached-name">{fileName || 'Uploaded PDF'}</span>
          <button type="button" className="btn sm quiet" onClick={() => { onChange(''); setFileName(''); }}>Remove</button>
        </div>
      ) : (
        <label className="pdf-link">
          <span className="muted">…or paste a link</span>
          <input
            className="ce-field"
            placeholder="https://… .pdf"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}

      {err && <p className="pdf-err">{err}</p>}
    </div>
  );
}

// Which VdoCipher video this lesson plays for ONE batch.
//
// Deliberately not part of the curriculum tree's Save: the mapping lives in
// its own collection keyed on (batch, lesson), because two cohorts of the same
// programme need different recordings — and an October batch must not inherit
// September's the moment it's attached. Picking saves straight away.
function LessonVideoPicker({ topic, batch }) {
  const [video, setVideo] = useState(null); // { videoId, title } | null
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [msg, setMsg] = useState('');

  // A lesson that has never been saved has no _id yet, so there is nothing to
  // key a mapping on — save the curriculum first.
  const topicId = topic._id;

  useEffect(() => {
    if (!topicId) { setLoading(false); return undefined; }
    let alive = true;
    setLoading(true);
    getLessonVideos(batch.id)
      .then((d) => {
        if (!alive) return;
        setVideo((d.videos || []).find((v) => String(v.topicId) === String(topicId)) || null);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [topicId, batch.id]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  async function attach(picked) {
    try {
      await setLessonVideo(batch.id, topicId, picked.id, picked.title || '');
      setVideo({ videoId: picked.id, title: picked.title || '' });
      flash(`Attached, students in ${batch.name} can watch it now.`);
    } catch (e) { flash(e.message); }
  }

  async function detach() {
    try {
      await clearLessonVideo(batch.id, topicId);
      setVideo(null);
      flash('Video removed for this batch.');
    } catch (e) { flash(e.message); }
  }

  return (
    <>
      <label className="ce-label">
        Lesson video <span className="muted">(from your VdoCipher library, {batch.name} only)</span>
      </label>

      {!topicId ? (
        <p className="muted">Save the curriculum first, then you can attach a video to this lesson.</p>
      ) : loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="lv-row">
          <div className="lv-batch">
            <strong>{video ? (video.title || video.videoId) : 'No video posted'}</strong>
            <span className="muted">{batch.name}</span>
          </div>
          <button type="button" className="btn sm" onClick={() => setPicking(true)}>
            {video ? 'Change' : 'Choose video'}
          </button>
          {video && <button type="button" className="btn sm quiet" onClick={detach}>Remove</button>}
        </div>
      )}

      {msg && <p className="muted">{msg}</p>}

      {picking && <VdoCipherPicker onPick={attach} onClose={() => setPicking(false)} />}
    </>
  );
}
