import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import BatchWorkspace from '../../components/BatchWorkspace.jsx';

// Mentor "Programs" screen: their batches → open one to schedule sessions, mark
// attendance, set assignments, and grade submissions (BatchWorkspace, mentor mode).
export default function MentorBatches() {
  const [batches, setBatches] = useState([]);
  const [open, setOpen] = useState(null);

  const load = () => api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  if (open) return (
    <div>
      <button className="btn ghost sm" onClick={() => { setOpen(null); load(); }}>← My batches</button>
      <div style={{ height: 12 }} />
      <BatchWorkspace batchId={open} mode="mentor" />
    </div>
  );

  return (
    <div>
      <h1>Programs</h1>
      <p className="muted">Your batches — open one to teach, mark attendance, and grade.</p>
      <div className="list">
        {batches.map((b) => (
          <div className="panel list-row" key={b.id}>
            <div>
              <strong>{b.name}</strong>
              <div className="muted">{b.program} · {b.status} · {b.studentCount} students</div>
            </div>
            <button className="btn sm" onClick={() => setOpen(b.id)}>Open</button>
          </div>
        ))}
        {batches.length === 0 && <p className="muted">You're not assigned to any batch yet. An admin assigns you in Batches.</p>}
      </div>
    </div>
  );
}
