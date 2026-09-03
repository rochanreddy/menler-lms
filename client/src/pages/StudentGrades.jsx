import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Empty, { Loading } from '../components/Empty.jsx';

// Student gradebook: one consolidated view of every assignment/quiz/exam and
// the grade received — the single place a student checks "how am I doing".
export default function StudentGrades() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, graded: 0, avgPct: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/grades/me').then((d) => { setRows(d.rows || []); setSummary(d.summary || {}); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const scoreCell = (r) => {
    if (r.status !== 'graded' || r.score == null) return <span className="muted">{r.status === 'submitted' ? 'Awaiting grade' : '-'}</span>;
    if (r.max) return <strong>{r.score}/{r.max} · {Math.round((r.score / r.max) * 100)}%</strong>;
    return <strong>{r.score}</strong>;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Student board</div>
          <h1>My grades</h1>
          <p>Every assessment and the grade you earned, in one place.</p>
        </div>
      </div>

      <div className="tiles" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="tile"><div className="tile-value">{summary.avgPct != null ? `${summary.avgPct}%` : '-'}</div><div className="tile-label">Average score</div></div>
        <div className="tile"><div className="tile-value">{summary.graded}/{summary.total}</div><div className="tile-label">Graded</div></div>
      </div>

      <div className="panel">
        {loading ? <Loading rows={4} /> : rows.length === 0 ? (
          <Empty icon="grades" title="No assessments yet." hint="Assignments and quizzes appear here as your mentor posts them, along with every score you are given." />
        ) : (
          <div className="table-wrap">
            <table className="grade-table">
              <thead><tr><th>Assessment</th><th>Type</th><th>Status</th><th>Score</th><th>Feedback</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td>{r.title}</td>
                    <td><span className={`gt-kind gt-${r.kind.toLowerCase()}`}>{r.kind}</span></td>
                    <td><span className={`gt-status gt-${r.status}`}>{r.status}</span></td>
                    <td>{scoreCell(r)}</td>
                    <td className="muted">{r.feedback || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
