import { useEffect, useState } from 'react';
import { listVdoCipherVideos } from '../api.js';

const mmss = (secs) => {
  if (!secs && secs !== 0) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Pick a video that already exists in the VdoCipher library. Nothing is
// uploaded from here — videos are put into VdoCipher through its own
// dashboard, and this only chooses which one a lesson points at.
export default function VdoCipherPicker({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    // Debounced so typing in the search box doesn't fire a request per key —
    // this hits VdoCipher's API, which is rate-limited.
    const t = setTimeout(() => {
      listVdoCipherVideos(q)
        .then((d) => { if (alive) { setVideos(d.videos || []); setLoading(false); } })
        .catch((e) => { if (alive) { setError(e.message || 'Could not reach VdoCipher.'); setLoading(false); } });
    }, q ? 350 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  return (
    <div className="cert-overlay" onClick={onClose}>
      <div className="panel vdo-picker" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Choose a video from VdoCipher</h3>
          <button className="btn sm ghost" onClick={onClose}>Close</button>
        </div>
        <input
          className="ce-field"
          placeholder="Search your VdoCipher library by title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          style={{ marginTop: 12 }}
        />

        {error && <p className="muted" style={{ marginTop: 12 }}>{error}</p>}
        {loading && !error && <p className="muted" style={{ marginTop: 12 }}>Loading your library…</p>}
        {!loading && !error && videos.length === 0 && (
          <p className="muted" style={{ marginTop: 12 }}>
            {q ? 'No videos match that search.' : 'No videos in your VdoCipher library yet.'}
          </p>
        )}

        <div className="vdo-picker-list">
          {videos.map((v) => {
            // A video still encoding in VdoCipher cannot be played yet, so it
            // is shown but not selectable — clearer than hiding it and leaving
            // someone hunting for a video they know they uploaded.
            const ready = v.status === 'ready';
            return (
              <button
                key={v.id}
                type="button"
                className="vdo-picker-row"
                disabled={!ready}
                title={ready ? 'Attach this video' : `Still processing in VdoCipher (${v.status})`}
                onClick={() => { onPick(v); onClose(); }}
              >
                <span className="vdo-picker-title">{v.title || v.id}</span>
                <span className="muted">{mmss(v.length)}</span>
                {!ready && <span className="badge badge-muted">{v.status}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
