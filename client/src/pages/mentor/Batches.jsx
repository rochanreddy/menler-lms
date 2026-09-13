import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import BatchWorkspace from '../../components/BatchWorkspace.jsx';
import MaterialsManager from '../../components/MaterialsManager.jsx';
import Empty from '../../components/Empty.jsx';

// Mentor "Programs" screen: their batches → open one to schedule sessions, mark
// attendance, set assignments, and grade submissions (BatchWorkspace, mentor
// mode) — plus the teacher-notes page for programs they teach. The full
// curriculum editor is the admin's; a mentor with a PDF and a Choose file
// button once imported a slide deck as 37 lessons.
export default function MentorBatches() {
  const { user } = useOutletContext();
  const [batches, setBatches] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [open, setOpen] = useState(null);
  // programId whose reading materials are open — the simple page, and the one
  // a mentor actually needs week to week.
  const [materials, setMaterials] = useState(null);

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

  if (materials) return <MaterialsManager programId={materials} onClose={() => { setMaterials(null); load(); }} />;

  if (open) return (
    <div>
      <button className="btn ghost sm" onClick={() => { setOpen(null); load(); }}>← My batches</button>
      <div style={{ height: 'var(--space-3)' }} />
      <BatchWorkspace batchId={open} mode="mentor" />
    </div>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Mentor board</div>
          <h1>Programs</h1>
          <p>Your batches. Open one to teach, mark attendance, and grade.</p>
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
          <h2 style={{ marginTop: 'var(--space-7)' }}>Teacher notes</h2>
          <p className="muted">Programs you teach. Drop a session’s PDFs on the session and students see them under <b>Teacher notes</b> on every lesson in it.</p>
          <div className="list">
            {myPrograms.map((p) => (
              <div className="panel list-row" key={p._id}>
                <div>
                  <strong>{p.title}</strong>
                  <div className="muted">{p.modules?.length || 0} modules · {lessons(p)} lessons · <span className={p.published ? 'pub-on' : 'pub-off'}>{p.published ? '● published' : '○ draft'}</span></div>
                </div>
                <button className="btn sm" onClick={() => setMaterials(p._id)}>Add teacher notes</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
