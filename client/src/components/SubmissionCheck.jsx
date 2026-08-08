// Shared UI for the Drive-folder verification layer of a submission.
//
// This is deliberately separate from the grading UI (score/feedback): a
// submission can be READY but ungraded, or graded despite NEEDS_FIXES if a
// mentor overrode the automated check by opening the folder themselves.
// Keep the two concerns in separate components so a later automated-review
// layer can slot in beside them without disturbing either.

const CHECK_LABELS = {
  PENDING_CHECK: 'Checking…',
  READY: 'Ready',
  NEEDS_FIXES: 'Needs fixes',
  CHECK_FAILED: 'Check failed',
};

// Student-facing wording — CHECK_FAILED is our fault, not theirs, so it must
// never read as something the student has to go fix.
const CHECK_LABELS_STUDENT = {
  ...CHECK_LABELS,
  CHECK_FAILED: 'Check pending — we’ll retry',
};

const badgeTone = (status) => {
  if (status === 'READY') return 'badge-student';
  if (status === 'PENDING_CHECK') return '';
  return 'badge-blocked';
};

export function CheckBadge({ status, audience = 'staff' }) {
  if (!status) return null;
  const labels = audience === 'student' ? CHECK_LABELS_STUDENT : CHECK_LABELS;
  return <span className={`badge ${badgeTone(status)}`}>{labels[status] || status}</span>;
}

/** The always-clickable Drive folder link. Shown regardless of checkStatus so a
 *  human can open the folder and override a wrong automated verdict. */
export function DriveLink({ href, label = 'Open Drive folder' }) {
  if (!href) return <span className="muted">No Drive link</span>;
  return <a href={href} target="_blank" rel="noreferrer">{label}</a>;
}

/** Individual file links, so a mentor doesn't have to navigate the folder. */
export function FileLinks({ files }) {
  if (!files?.length) return null;
  return (
    <ul className="sub-files">
      {files.map((f, i) => (
        <li key={f.webViewLink || `${f.name}-${i}`}>
          <a href={f.webViewLink} target="_blank" rel="noreferrer">{f.name}</a>
          <span className="badge">{f.type}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Full verification panel for mentor/admin detail views: status badge, the
 * always-clickable folder link, inline error text when the check didn't pass,
 * per-file links when it did, and a manual re-check trigger.
 */
export function SubmissionCheckPanel({ submission, onRecheck, busy = false, audience = 'staff' }) {
  if (!submission) return null;
  const { checkStatus, errorDetail, files, driveLink } = submission;
  const failed = checkStatus === 'NEEDS_FIXES' || checkStatus === 'CHECK_FAILED';

  return (
    <div className="sub-check">
      <div className="sub-check-head">
        <DriveLink href={driveLink} />
        <CheckBadge status={checkStatus} audience={audience} />
        {submission.locked && <span className="badge">locked</span>}
        {onRecheck && driveLink && (
          <button type="button" className="btn sm ghost" onClick={onRecheck} disabled={busy}>
            {busy ? 'Re-checking…' : 'Re-check'}
          </button>
        )}
      </div>

      {failed && errorDetail && <p className="sub-check-error">{errorDetail}</p>}
      {checkStatus === 'READY' && <FileLinks files={files} />}
    </div>
  );
}

export { CHECK_LABELS, CHECK_LABELS_STUDENT };
