import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import BatchWorkspace from '../../components/BatchWorkspace.jsx';
import CurriculumEditor from '../../components/CurriculumEditor.jsx';
import Empty from '../../components/Empty.jsx';

// Mentor "Programs" screen: their batches → open one to schedule sessions, mark
// attendance, set assignments, and grade submissions (BatchWorkspace, mentor
// mode) — plus curriculum editing for programs the admin assigned them to.
export default function MentorBatches() {
  const { user } = useOutletContext();
  const [batches, setBatches] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null); // programId whose curriculum is being edited

  const load = () => {
    api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {});
    api('/programs').then((d) => setPrograms(d.programs || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // Programs this mentor teaches — admin-assigned to the program itself, or
  // behind any batch they run. Matches the server's curriculum-edit rule.
  const myPrograms = programs.filter((p) =>
    (p.mentorIds || []).map(String).includes(String(user.id)) ||
    batches.some((b) => String(b.programId) === String(p._id)));
  const lessons = (p) => (p.modules || []).reduce((n, m) => n + (m.chapters || []).reduce((k, c) => k + (c.topics || []).length, 0), 0);

  if (editing) return <CurriculumEditor programId={editing} onClose={() => { setEditing(null); load(); }} />;

  if (open) return (
    <div>
      <button className="btn ghost sm" onClick={() => { setOpen(null); load(); }}>← My batches</button>
      <div style={{ height: 12 }} />
      <BatchWorkspace batchId={open} mode="mentor" />
    </div>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Mentor board</div>
          <h1>Programs</h1>
          <p>Your batches — open one to teach, mark attendance, and grade.</p>
        </div>
      </div>
      <div className="list">
        {batches.map((b) => (
          <div className="panel list-row row-click" key={b.id} onClick={() => setOpen(b.id)}>
            <div>
              <strong>{b.name}</strong>
              <div className="muted">{b.program} · {b.status} · {b.studentCount} students</div>
            </div>
            <button className="btn sm" onClick={() => setOpen(b.id)}>Open</button>
          </div>
        ))}
        {batches.length === 0 && (
          <Empty icon="batches" title="You are not assigned to a batch yet." hint="An admin assigns mentors to batches under Admin → Batches." />
        )}
      </div>

      {myPrograms.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>My curriculum</h2>
          <p className="muted">Programs you teach — edit their modules, chapters, and lessons.</p>
          <div className="list">
            {myPrograms.map((p) => (
              <div className="panel list-row" key={p._id}>
                <div>
                  <strong>{p.title}</strong>
                  <div className="muted">{p.modules?.length || 0} modules · {lessons(p)} lessons · <span className={p.published ? 'pub-on' : 'pub-off'}>{p.published ? '● published' : '○ draft'}</span></div>
                </div>
                <button className="btn sm" onClick={() => setEditing(p._id)}>Edit curriculum</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
