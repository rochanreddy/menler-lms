import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import FileViewer from '../../components/FileViewer.jsx';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// The pipeline, in order. Drives both the filter tabs and the action buttons,
// so adding a stage server-side only needs one change here.
const STAGES = [
  { key: 'applied', label: 'Applied', action: 'Move back to Applied' },
  { key: 'shortlisted', label: 'Shortlisted', action: 'Shortlist' },
  { key: 'rejected', label: 'Rejected', action: 'Reject' },
];

// Only shortlisting is a primary (filled) action. Reject uses the soft-danger
// treatment rather than `.btn.danger`, whose solid red reads as the dominant
// move on the card — the opposite of what you want a recruiter to reach for.
const ACTION_STYLE = { applied: 'quiet', shortlisted: '', rejected: 'ghost-danger' };

// The shared reader renders PDFs itself (pdf.js) rather than framing them, so
// it works cross-origin. Anything else — a .docx, or a Drive/Dropbox share link
// — goes through an iframe that those hosts will refuse, so send it straight to
// a new tab instead of showing a dead grey box.
function canReadInApp(url) {
  if (!url) return false;
  return (url.split(/[?#]/)[0].split('.').pop() || '').toLowerCase() === 'pdf';
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="cand-field">
      <span className="cand-field-label">{label}</span>
      <span className="cand-field-value">{value}</span>
    </div>
  );
}

// Full candidate view. Everything the student chose to put on their profile —
// the partner has no other window into them, since they're walled off from
// batches, grades and coursework by design.
function CandidateDetail({ app, onStatus, busy, onRead }) {
  const s = app.studentId || {};
  const edu = s.education || {};
  const pro = s.professional || {};
  const hasEdu = edu.degree || edu.institution || edu.year;
  const hasPro = pro.title || pro.company || pro.experience;

  return (
    <div className="panel cand-detail">
      <div className="cand-detail-head">
        <div>
          <h2 className="cand-name">{s.fullName || s.email}</h2>
          <div className="muted">{s.email}{s.phone ? ` · ${s.phone}` : ''}</div>
          <div className="muted cand-applied-on">Applied {fmtDate(app.createdAt)}</div>
        </div>
        <span className={`badge cand-st-${app.status}`}>{app.status}</span>
      </div>

      <div className="cand-sections">
        <section>
          <div className="eyebrow">Education</div>
          {hasEdu ? (
            <>
              <Field label="Degree" value={edu.degree} />
              <Field label="Institution" value={edu.institution} />
              <Field label="Year" value={edu.year} />
            </>
          ) : <p className="muted">Not filled in by the candidate.</p>}
        </section>

        <section>
          <div className="eyebrow">Professional</div>
          {hasPro ? (
            <>
              <Field label="Title" value={pro.title} />
              <Field label="Company" value={pro.company} />
              <Field label="Experience" value={pro.experience} />
            </>
          ) : <p className="muted">Not filled in by the candidate.</p>}
        </section>
      </div>

      <section className="cand-resume">
        <div className="eyebrow">Resume</div>
        {s.resumeUrl ? (
          <div className="row cand-resume-actions">
            {canReadInApp(s.resumeUrl) ? (
              <button className="btn sm" onClick={() => onRead(app)}>Read resume</button>
            ) : (
              <a className="btn sm" href={s.resumeUrl} target="_blank" rel="noreferrer">Open resume</a>
            )}
          </div>
        ) : (
          <p className="muted">No resume on file. The candidate can add one from their profile.</p>
        )}
      </section>

      {/* Buttons name the ACTION, not the destination state — "Shortlisted"
          read as a label for where the candidate already was. */}
      <div className="row cand-actions">
        {STAGES.filter((st) => st.key !== app.status).map((st) => (
          <button
            key={st.key}
            className={`btn sm ${ACTION_STYLE[st.key]}`}
            disabled={busy}
            onClick={() => onStatus(app._id, st.key)}
          >
            {st.action}
          </button>
        ))}
      </div>
    </div>
  );
}

// Partner: pick one of your jobs → see who applied, open a candidate for their
// full profile + resume, and move them through the pipeline.
export default function Applicants() {
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');
  const [applicants, setApplicants] = useState([]);
  const [selected, setSelected] = useState(null); // application _id
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reading, setReading] = useState(null); // { label, subtitle, url }

  useEffect(() => {
    api('/jobs/mine').then((d) => {
      setJobs(d.jobs || []);
      if (d.jobs?.[0]) setJobId(d.jobs[0]._id);
    }).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!jobId) return;
    setSelected(null);
    api(`/jobs/${jobId}/applicants`)
      .then((d) => setApplicants(d.applicants || []))
      .catch(() => setApplicants([]));
  }, [jobId]);

  const counts = useMemo(() => {
    const c = { all: applicants.length };
    for (const st of STAGES) c[st.key] = applicants.filter((a) => a.status === st.key).length;
    return c;
  }, [applicants]);

  const shown = filter === 'all' ? applicants : applicants.filter((a) => a.status === filter);
  const current = applicants.find((a) => a._id === selected) || null;

  function openResume(app) {
    const s = app.studentId || {};
    setReading({ label: 'Resume', subtitle: s.fullName || s.email, url: s.resumeUrl });
  }

  async function setStatus(appId, status) {
    setErr('');
    setBusy(true);
    try {
      const { application } = await api(`/jobs/${jobId}/applicants/${appId}`, { method: 'PATCH', body: { status } });
      // Patch in place so the list keeps its order and the open card stays open.
      setApplicants((list) => list.map((a) => (a._id === appId ? application : a)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Partner board</div>
          <h1>Applicants</h1>
          <p>Candidates who applied to your roles.</p>
        </div>
      </div>

      {err && <p className="error">{err}</p>}

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

          <div className="row cand-filters">
            {[{ key: 'all', label: 'All' }, ...STAGES].map((st) => (
              <button
                key={st.key}
                className={`cand-tab ${filter === st.key ? 'on' : ''}`}
                onClick={() => setFilter(st.key)}
              >
                {st.label} <span className="cand-tab-count">{counts[st.key] || 0}</span>
              </button>
            ))}
          </div>

          <div className="cand-layout">
            <div className="list">
              {shown.map((a) => (
                <button
                  key={a._id}
                  className={`panel list-row cand-row ${selected === a._id ? 'on' : ''}`}
                  onClick={() => setSelected(selected === a._id ? null : a._id)}
                >
                  <div>
                    <strong>{a.studentId?.fullName || a.studentId?.email}</strong>
                    <div className="muted">
                      {a.studentId?.professional?.title || a.studentId?.education?.degree || a.studentId?.email}
                    </div>
                  </div>
                  <div className="row">
                    {a.studentId?.resumeUrl && <span className="cand-cv-dot" title="Resume attached">CV</span>}
                    <span className={`badge cand-st-${a.status}`}>{a.status}</span>
                  </div>
                </button>
              ))}
              {shown.length === 0 && (
                <p className="muted">
                  {applicants.length === 0 ? 'No applicants yet for this role.' : 'No candidates at this stage.'}
                </p>
              )}
            </div>

            {current
              ? <CandidateDetail app={current} onStatus={setStatus} busy={busy} onRead={openResume} />
              : shown.length > 0 && <div className="panel cand-empty muted">Select a candidate to see their profile and resume.</div>}
          </div>
        </>
      )}

      {/* Same reader the students read course PDFs in, with the new-tab escape
          switched on — a resume is the candidate's to share, not ours to lock. */}
      {reading && <FileViewer {...reading} allowNewTab onClose={() => setReading(null)} />}
    </div>
  );
}
