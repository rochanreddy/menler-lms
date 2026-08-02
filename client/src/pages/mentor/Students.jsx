import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '—');

// Mentor: every student across the batches they run — read-only monitoring.
// Open one to see their full progress, submissions, quizzes, and download the
// report. (No blocking or account controls — those are admin powers.)
export default function MentorStudents() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => { api('/users/my-students').then((d) => setStudents(d.students || [])).catch(() => {}); }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => (s.full_name || '').toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [students, search]);

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
      </form>

      <div className="list">
        {shown.map((s) => (
          <div className="panel list-row" key={s.id}>
            <div>
              <strong>{s.full_name || '—'}</strong>
              <div className="muted">{s.email} · {s.batches.join(', ') || 'no batch'} · last active {fmtDate(s.last_active_at)}</div>
            </div>
            <Link className="btn sm" to={`/app/students/${s.id}`}>Open</Link>
          </div>
        ))}
        {shown.length === 0 && <p className="muted">{students.length === 0 ? 'No students in your batches yet.' : 'No matches.'}</p>}
      </div>
    </div>
  );
}
