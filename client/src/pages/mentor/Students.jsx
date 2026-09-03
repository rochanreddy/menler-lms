import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import Empty from '../../components/Empty.jsx';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '-');

// Mentor: every student across the batches they run — read-only monitoring.
// Open one to see their full progress, submissions, quizzes, and download the
// report. (No blocking or account controls — those are admin powers.)
export default function MentorStudents() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [search, setSearch] = useState('');
  const [batchId, setBatchId] = useState('');

  useEffect(() => {
    api('/users/my-students').then((d) => { setStudents(d.students || []); setBatches(d.batches || []); }).catch(() => {});
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => !batchId || (s.batch_ids || []).includes(batchId))
      .filter((s) => !q || (s.full_name || '').toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [students, search, batchId]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Mentor board</div>
          <h1>Students</h1>
          <p>Everyone across your batches. Open a student to check where they are in the course.</p>
        </div>
      </div>

      <form className="inline-form" onSubmit={(e) => e.preventDefault()}>
        <input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 280 }} />
        {batches.length > 1 && (
          <label>Batch{' '}
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">All batches</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
      </form>

      <div className="list">
        {shown.map((s) => (
          <div className="panel list-row row-click" key={s.id} onClick={() => navigate(`/app/students/${s.id}`)}>
            <div>
              <strong>{s.full_name || '-'}</strong>
              <div className="muted">{s.email} · {s.batches.join(', ') || 'no batch'} · last active {fmtDate(s.last_active_at)}</div>
            </div>
            <Link className="btn sm" to={`/app/students/${s.id}`}>Open</Link>
          </div>
        ))}
        {shown.length === 0 && (
          <Empty
            icon="students"
            title={students.length === 0 ? 'No students yet.' : 'No matches.'}
            hint={students.length === 0
              ? 'Students appear here once they are enrolled in one of your batches.'
              : 'Try a different name/email, or clear the batch filter.'}
          />
        )}
      </div>
    </div>
  );
}
