import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import AtRiskPanel from '../../components/AtRiskPanel.jsx';
import Empty from '../../components/Empty.jsx';

// Mentor board — stat cards + an attendance-by-batch bar chart, wired to live data.
export default function MentorHome() {
  const { user } = useOutletContext();
  const [batches, setBatches] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [overview, setOverview] = useState([]);

  useEffect(() => {
    api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {});
    api('/sessions').then((d) => setSessions(d.sessions || [])).catch(() => {});
    api('/quizzes').then((d) => setQuizzes(d.quizzes || [])).catch(() => {});
    api('/attendance/overview').then((d) => setOverview(d.overview || [])).catch(() => {});
  }, []);

  const students = batches.reduce((n, b) => n + (b.studentCount || 0), 0);
  const stats = [
    { label: 'Batches', value: batches.length },
    { label: 'Students', value: students },
    { label: 'Live Sessions', value: sessions.length },
    { label: 'Quizzes', value: quizzes.length },
  ];
  const chart = overview.filter((o) => o.total > 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Mentor</div>
          <p className="greet">Good to see you, {(user.full_name || 'Mentor').split(' ')[0]}.</p>
          <p>Here's what's happening across your cohorts.</p>
        </div>
      </div>

      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <AtRiskPanel />

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Attendance</div>
        <h2>How your cohorts are showing up</h2>
        {chart.length === 0 ? (
          <Empty inline icon="students" title="No attendance recorded yet." hint="Mark attendance on any session and the trend shows up here." />
        ) : (
          <div className="chart" style={{ marginTop: 22 }}>
            <div className="chart-grid">
              {[100, 75, 50, 25].map((g) => (
                <span key={g} style={{ bottom: `${g}%` }}>{g}%</span>
              ))}
            </div>
            {chart.map((b) => (
              <div className="bar-col" key={b.batchId}>
                <div className="bar-val">{b.pct}%</div>
                <div className="bar" style={{ height: `${b.pct}%` }} />
                <div className="bar-name">{b.name.replace(/^Demo — /, '')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
