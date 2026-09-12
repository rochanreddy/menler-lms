import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import Empty from '../../components/Empty.jsx';

// Admin: what every student said about every class. Admin-only by design —
// mentors never see reviews of their own classes, which is the whole reason
// students answer honestly.
const PACE_LABEL = { slow: 'Too slow', right: 'Just right', fast: 'Too fast' };
const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
const fmt = (d) => (d ? new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function AdminFeedback() {
  const [data, setData] = useState(null);
  const [batchId, setBatchId] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    api(`/reviews${batchId ? `?batchId=${batchId}` : ''}`).then(setData).catch((e) => setErr(e.message));
  }, [batchId]);

  // Batches arrive with the reviews, so the filter is never a second request.
  const batches = data?.batches || [];
  const shown = data?.reviews || [];
  const s = data?.summary;
  const pacePct = useMemo(() => {
    if (!s?.count) return null;
    const p = s.pace || {};
    return { slow: Math.round((p.slow || 0) / s.count * 100), right: Math.round((p.right || 0) / s.count * 100), fast: Math.round((p.fast || 0) / s.count * 100) };
  }, [s]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin board</div>
          <h1>Feedback</h1>
          <p>What students said about each class. Mentors cannot see this.</p>
        </div>
      </div>

      <div className="inline-form">
        <label className="muted">Batch{' '}
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">All batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.program ? ` · ${b.program}` : ''}</option>)}
          </select>
        </label>
      </div>

      {err && <p className="error">{err}</p>}

      {s && s.count > 0 && (
        <div className="stats" style={{ marginTop: 'var(--space-4)' }}>
          <div className="stat"><div className="stat-label">Reviews</div><div className="stat-value">{s.count}</div></div>
          <div className="stat"><div className="stat-label">Average rating</div><div className="stat-value">{s.avg} / 5</div></div>
          <div className="stat"><div className="stat-label">Pace</div><div className="stat-value" style={{ fontSize: 'var(--text-base)' }}>{pacePct.right}% just right</div><div className="muted" style={{ fontSize: 'var(--text-sm)' }}>{pacePct.slow}% too slow · {pacePct.fast}% too fast</div></div>
        </div>
      )}

      <div className="list" style={{ marginTop: 'var(--space-5)' }}>
        {shown.map((r) => (
          <div className="panel" key={r.id}>
            <div className="list-row">
              <div>
                <strong>{r.session.title || 'A class'}</strong>
                <div className="muted">{fmt(r.session.startsAt)}{r.batch ? ` · ${r.batch}` : ''}</div>
              </div>
              <div className="row">
                <span className="badge badge-muted">{PACE_LABEL[r.pace] || r.pace}</span>
                {!r.attended && <span className="badge badge-muted" title="Not marked present for this class">did not attend</span>}
                <span className="rating-stars" title={`${r.rating} out of 5`}>{stars(r.rating)}</span>
              </div>
            </div>
            {r.comment && <p style={{ marginTop: 'var(--space-2)' }}>{r.comment}</p>}
            <div className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
              {r.student.name || r.student.email} · {fmt(r.createdAt)}
            </div>
          </div>
        ))}
        {data && shown.length === 0 && (
          <Empty icon="forum" title="No reviews yet." hint="Students are asked to review a class the next time they open the LMS after it ends." />
        )}
      </div>
    </div>
  );
}
