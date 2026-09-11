import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import AtRiskPanel from '../../components/AtRiskPanel.jsx';
import Empty from '../../components/Empty.jsx';
import LiveClassCard from '../../components/LiveClassCard.jsx';

// Mentor board — stat cards + an attendance-by-batch bar chart, wired to live data.
export default function MentorHome() {
  const { user } = useOutletContext();
  const [batches, setBatches] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [pastSessions, setPastSessions] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [overview, setOverview] = useState([]);

  useEffect(() => {
    api('/batches').then((d) => setBatches(d.batches || [])).catch(() => {});
    api('/sessions?scope=upcoming').then((d) => setSessions(d.sessions || [])).catch(() => {});
    // Past sessions too: the Join Zoom Call button falls back to the most
    // recent one when nothing is scheduled today, same as the student home.
    api('/sessions?scope=past').then((d) => setPastSessions(d.sessions || [])).catch(() => {});
    api('/quizzes').then((d) => setQuizzes(d.quizzes || [])).catch(() => {});
    api('/attendance/overview').then((d) => setOverview(d.overview || [])).catch(() => {});
  }, []);

  const students = batches.reduce((n, b) => n + (b.studentCount || 0), 0);
  const stats = [
    { label: 'Batches', value: batches.length },
    { label: 'Students', value: students },
    { label: 'Live Sessions', value: sessions.length + pastSessions.length },
    { label: 'Quizzes', value: quizzes.length },
  ];
  const chart = overview.filter((o) => o.total > 0);

  // Same rule as the student home (GET /sessions/live): a session on TODAY's
  // date wins; otherwise the next one coming up; only when none are left, the
  // newest past one with its recording. Mentors don't mark their own
  // attendance, so this is a plain join link — no attendance call on click.
  const liveClass = useMemo(() => {
    const isToday = (d) => {
      const a = new Date(d), b = new Date();
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    };
    const today = sessions.find((s) => isToday(s.startsAt)) || pastSessions.find((s) => isToday(s.startsAt));
    const next = today ? null : sessions[0]; // upcoming, soonest first
    const session = today || next || pastSessions[0];
    if (!session) return null;
    return { session, today: !!today, upcoming: !!next, url: today ? session.joinUrl || '' : next ? '' : session.recordingUrl || '' };
  }, [sessions, pastSessions]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Mentor</div>
          <p className="greet">Good to see you, {(user.full_name || 'Mentor').split(' ')[0]}.</p>
          <p>Here's what's happening across your cohorts.</p>
        </div>
      </div>

      {liveClass && <LiveClassCard liveClass={liveClass} />}

      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <AtRiskPanel />

      <div className="panel" style={{ marginTop: 'var(--space-6)' }}>
        <div className="eyebrow">Attendance</div>
        <h2>How your cohorts are showing up</h2>
        {chart.length === 0 ? (
          <Empty inline icon="students" title="No attendance recorded yet." hint="Mark attendance on any session and the trend shows up here." />
        ) : (
          <div className="chart" style={{ marginTop: 'var(--space-6)' }}>
            <div className="chart-grid">
              {[100, 75, 50, 25].map((g) => (
                <span key={g} style={{ bottom: `${g}%` }}>{g}%</span>
              ))}
            </div>
            {chart.map((b) => (
              <div className="bar-col" key={b.batchId}>
                <div className="bar-val">{b.pct}%</div>
                <div className="bar" style={{ height: `${b.pct}%` }} />
                <div className="bar-name">{b.name.replace(/^Demo[^A-Za-z0-9]+/, '')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
