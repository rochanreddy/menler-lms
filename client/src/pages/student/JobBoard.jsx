import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Student Job Board: browse partner-posted jobs, apply, and track applications.
export default function JobBoard() {
  const [jobs, setJobs] = useState([]);
  const [apps, setApps] = useState([]);

  const load = () => {
    api('/jobs').then((d) => setJobs(d.jobs || [])).catch(() => {});
    api('/jobs/applied/me').then((d) => setApps(d.applications || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function apply(job) {
    await api(`/jobs/${job._id}/apply`, { method: 'POST' });
    if (job.applyUrl) window.open(job.applyUrl, '_blank');
    load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Job Board</div>
          <h1>Openings for you</h1>
          <p>Roles from Menler's hiring partners.</p>
        </div>
      </div>

      <div className="list">
        {jobs.map((j) => (
          <div key={j._id} className="panel list-row">
            <div>
              <strong>{j.title}</strong> <span className="muted">· {j.company}</span>
              <div className="muted">{j.location || 'Remote'}{j.description ? ` — ${j.description}` : ''}</div>
            </div>
            <button className="btn sm" disabled={j.appliedByMe} onClick={() => apply(j)}>{j.appliedByMe ? 'Applied ✓' : 'Apply'}</button>
          </div>
        ))}
        {jobs.length === 0 && <p className="muted">No openings yet — check back soon.</p>}
      </div>

      {apps.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>My applications</h2>
          <div className="list">
            {apps.map((a) => (
              <div key={a._id} className="panel list-row">
                <div><strong>{a.jobId?.title}</strong> <span className="muted">· {a.jobId?.company}</span></div>
                <span className="badge">{a.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
