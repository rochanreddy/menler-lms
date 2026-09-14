/**
 * The certificate itself, as a printable sheet.
 *
 * Lives here rather than inside Classroom because two screens show the same
 * object: the Classroom, when you finish a programme, and the Profile, which
 * lists every certificate you hold including ones an admin issued to your
 * cohort. One component means the printed sheet cannot drift between them.
 *
 * `cert` is whatever the API returned — /progress/certificate or an entry
 * from /certificates/mine. Both carry name, program, issuedAt, certId, and
 * (once issued through the new path) verifyUrl and qr.
 */
/** "November, 2026" — the form the id itself encodes as MMYY. */
const monthYear = (d) => {
  const dt = new Date(d);
  return `${dt.toLocaleDateString('en-US', { month: 'long' })}, ${dt.getFullYear()}`;
};

function CertificateModal({ cert, onClose }) {
  return (
    <div className="cert-overlay" onClick={onClose}>
      <div className="cert" onClick={(e) => e.stopPropagation()}>
        <div className="cert-inner">
          <div className="cert-brand">menler</div>
          <div className="cert-kicker">Certificate of Completion</div>
          <div className="cert-name">{cert.name}</div>
          <p className="cert-body">has successfully completed</p>
          <div className="cert-program">{cert.program}</div>
          {cert.batch && <div className="cert-batch">{cert.batch}</div>}
          {/* The QR is the whole point of the footer: a certificate is shown
              to people who were not in the room, and scanning beats typing a
              code off a printed page. The URL is printed under the id as well,
              because a photograph of a certificate taken at an angle often has
              a readable line of text and an unreadable QR. */}
          <div className="cert-foot">
            {cert.qr && (
              <figure className="cert-qr">
                <img src={cert.qr} alt={`QR code linking to ${cert.verifyUrl}`} width="90" height="90" />
                <figcaption>Scan to verify</figcaption>
              </figure>
            )}
            <div className="cert-meta">
              {/* One line, in the form the certificate is quoted in: the month
                  and year it was issued, then the id. Explicit month name and
                  year rather than toLocaleDateString(), which renders
                  14/09/2026 or 9/14/2026 depending on where the reader happens
                  to be — a date on a credential should not be ambiguous. */}
              <span>Issued on {monthYear(cert.issuedAt)} · <span className="cert-id">{cert.certId}</span></span>
              {cert.verifyUrl && <span className="cert-verify">{cert.verifyUrl.replace('https://', '').replace('http://', '')}</span>}
            </div>
          </div>
        </div>
        <div className="cert-actions">
          <button className="btn" onClick={() => window.print()}>Download / Print</button>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default CertificateModal;
