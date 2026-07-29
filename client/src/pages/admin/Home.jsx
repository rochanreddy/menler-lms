import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import AtRiskPanel from '../../components/AtRiskPanel.jsx';

// Admin platform overview — headline counts + students-per-batch bar chart.
export default function AdminHome() {
  const [data, setData] = useState({ stats: {}, perBatch: [] });
  useEffect(() => { api('/stats/overview').then(setData).catch(() => {}); }, []);

  const s = data.stats;
  const cards = [
    { label: 'Students', value: s.students ?? '—' },
    { label: 'Mentors', value: s.mentors ?? '—' },
    { label: 'Batches', value: s.batches ?? '—' },
    { label: 'Quizzes', value: s.quizzes ?? '—' },
  ];
  const chart = (data.perBatch || []).filter((b) => b.count > 0);
  const max = Math.max(1, ...chart.map((b) => b.count));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <p className="greet">Everything, at a glance.</p>
          <p>What's happening across Menler LMS right now.</p>
        </div>
      </div>

      <div className="stats">
        {cards.map((c) => (
          <div className="stat" key={c.label}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value">{c.value}</div>
          </div>
        ))}
      </div>

      <AtRiskPanel />

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Enrolment by batch</div>
        <h2>Students per cohort</h2>
        {chart.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>No enrolments yet.</p>
        ) : (
          <div className="chart" style={{ marginTop: 22 }}>
            {chart.map((b) => (
              <div className="bar-col" key={b.name}>
                <div className="bar-val">{b.count}</div>
                <div className="bar" style={{ height: `${Math.round((b.count / max) * 100)}%` }} />
                <div className="bar-name">{b.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
