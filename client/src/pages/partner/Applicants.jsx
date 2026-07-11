import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Partner: pick one of your jobs → see who applied (with profile + resume).
export default function Applicants() {
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');
  const [applicants, setApplicants] = useState([]);

  useEffect(() => {
    api('/jobs/mine').then((d) => {
      setJobs(d.jobs || []);
      if (d.jobs?.[0]) setJobId(d.jobs[0]._id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!jobId) return;
    api(`/jobs/${jobId}/applicants`).then((d) => setApplicants(d.applicants || [])).catch(() => setApplicants([]));
  }, [jobId]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Partner board</div>
          <h1>Applicants</h1>
          <p>Candidates who applied to your roles.</p>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="muted">Post a job first — applicants will show up here.</p>
      ) : (
        <>
          <div className="learn-select">
            <label>Job{' '}
              <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                {jobs.map((j) => <option key={j._id} value={j._id}>{j.title} · {j.company}</option>)}
              </select>
            </label>
          </div>
          <div className="list">
            {applicants.map((a) => (
              <div key={a._id} className="panel list-row">
                <div>
                  <strong>{a.studentId?.fullName || a.studentId?.email}</strong>
                  <div className="muted">{a.studentId?.email}{a.studentId?.professional?.title ? ` · ${a.studentId.professional.title}` : ''}</div>
                </div>
                <div className="row">
                  {a.studentId?.resumeUrl && <a className="zoom-link" href={a.studentId.resumeUrl} target="_blank" rel="noreferrer">Resume</a>}
                  <span className="badge">{a.status}</span>
                </div>
              </div>
            ))}
            {applicants.length === 0 && <p className="muted">No applicants yet for this role.</p>}
          </div>
        </>
      )}
    </div>
  );
}
