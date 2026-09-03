import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import Empty from '../components/Empty.jsx';
import CurriculumEditor from '../components/CurriculumEditor.jsx';

// Admin: create + list programs, and manage each program's curriculum (upload
// docs → auto-structured lessons students see in Learning).
export default function ProgramsManage() {
  const { user } = useOutletContext();
  const isAdmin = user.role === 'admin';
  const [programs, setPrograms] = useState([]);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  // { programId } for the shared curriculum, or { programId, batch } to work
  // on one cohort's videos. Videos are attached per batch (see
  // BatchLessonVideo on the server), so a batch is how you reach them.
  const [editing, setEditing] = useState(null);
  const [batches, setBatches] = useState([]);
  // Per-programme "add a cohort" draft, keyed by programme id.
  const [draft, setDraft] = useState({});

  const load = () => {
    api('/programs').then((d) => setPrograms(d.programs || [])).catch(() => {});
    api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setErr('');
    try {
      await api('/programs', { method: 'POST', body: { title } });
      setTitle('');
      load();
    } catch (e2) { setErr(e2.message); }
  }

  if (editing) {
    return (
      <CurriculumEditor
        programId={editing.programId}
        batch={editing.batch}
        onClose={() => { setEditing(null); load(); }}
      />
    );
  }

  const batchesOf = (programId) => batches.filter((b) => String(b.programId) === String(programId));

  // A cohort belongs UNDER a programme — it inherits that programme's
  // curriculum, which is the whole point: naming a batch "Sept 2026" must not
  // spawn a second, empty copy of Kickstarter. Only the videos differ per
  // batch (see BatchLessonVideo on the server).
  async function addBatch(program) {
    const d = draft[program._id] || {};
    const label = (d.name || '').trim();
    if (!label) return;
    // Typing the full "Kickstarter · Sept 2026" shouldn't double up the title.
    const lower = label.toLowerCase();
    const bare = lower.startsWith(program.title.toLowerCase())
      ? (label.slice(program.title.length).replace(/^[\s.·-]+/, '').trim() || label)
      : label;
    const startDate = d.start ? new Date(d.start) : null;
    try {
      await api('/batches', {
        method: 'POST',
        body: {
          programId: program._id,
          name: `${program.title} · ${bare}`,
          startDate,
          // No date given → it hasn't started as far as we know.
          status: startDate && startDate <= new Date() ? 'ongoing' : 'upcoming',
        },
      });
      setDraft((prev) => ({ ...prev, [program._id]: {} }));
      load();
    } catch (e2) { setErr(e2.message); }
  }

  const setDraftField = (programId, patch) =>
    setDraft((prev) => ({ ...prev, [programId]: { ...(prev[programId] || {}), ...patch } }));
  const lessons = (p) => (p.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{isAdmin ? 'Admin board' : 'Programs'}</div>
          <h1>Programs</h1>
          <p>Every program and its curriculum, the lessons students see in Learning.</p>
        </div>
      </div>

      {isAdmin && (
        <form className="panel row" onSubmit={create}>
          <input placeholder="New PROGRAMME title (e.g. Kickstarter). For a new month, use “Add cohort” below" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <button className="btn">Create</button>
          {err && <span className="error">{err}</span>}
        </form>
      )}

      <div className="list">
        {programs.map((p) => (
          <div className="panel" key={p._id}>
            <div className="list-row">
            <div>
              <strong>{p.title}</strong>
              <div className="muted">{p.modules?.length || 0} modules · {lessons(p)} lessons · <span className={p.published ? 'pub-on' : 'pub-off'}>{p.published ? '● published' : '○ draft'}</span></div>
            </div>
            {isAdmin && <button className="btn sm" onClick={() => setEditing({ programId: p._id })}>Manage curriculum</button>}
            </div>

            {/* Each cohort of this programme. Lesson videos are per batch, so
                September's students never see October's recordings and vice
                versa — you attach them from inside the batch. */}
            <div className="prog-batches">
              {batchesOf(p._id).map((b) => (
                <div className="prog-batch" key={b.id}>
                  <span className="prog-batch-name">{b.name}</span>
                  <span className="muted">{b.studentCount} student{b.studentCount === 1 ? '' : 's'}</span>
                  <span className={`badge ${b.status === 'ongoing' ? '' : 'badge-muted'}`}>{b.status}</span>
                  {isAdmin && (
                    <button className="btn sm quiet" onClick={() => setEditing({ programId: p._id, batch: b })}>
                      Lesson videos →
                    </button>
                  )}
                </div>
              ))}
              {batchesOf(p._id).length === 0 && (
                <p className="muted prog-batch-none">No cohorts yet. Add one below and it inherits this programme's {lessons(p)} lessons.</p>
              )}
              {isAdmin && (
                <form
                  className="prog-batch-add"
                  onSubmit={(e) => { e.preventDefault(); addBatch(p); }}
                >
                  <input
                    type="text"
                    placeholder={`Add a cohort to ${p.title}, e.g. Sept 2026`}
                    value={draft[p._id]?.name || ''}
                    onChange={(e) => setDraftField(p._id, { name: e.target.value })}
                  />
                  <input
                    type="date"
                    title="Start date (optional)"
                    value={draft[p._id]?.start || ''}
                    onChange={(e) => setDraftField(p._id, { start: e.target.value })}
                  />
                  <button className="btn sm quiet">Add cohort</button>
                </form>
              )}
            </div>
          </div>
        ))}
        {programs.length === 0 && <Empty icon="programs" title="No programmes yet." hint={isAdmin ? 'Create one above, then add batches and curriculum to it.' : 'An admin needs to create one before batches can be set up.'} />}
      </div>
    </div>
  );
}
