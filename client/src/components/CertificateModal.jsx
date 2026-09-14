import anthropicLogo from '../assets/certificate/anthropic.webp';
import msmeLogo from '../assets/certificate/msme.webp';
// The cut-out version. The webp on the marketing site is a 200x200 solid
// rectangle with no alpha at all, so forcing it white produced a white box
// where the logo should be — this one is the same mark on transparency.
import sarvamLogo from '../assets/certificate/sarvam.png';
import startupIndiaLogo from '../assets/certificate/startup-india.png';

/**
 * The certificate itself, as a printable sheet.
 *
 * Lives here rather than inside Classroom because two screens render the same
 * object: the Classroom, when you finish a programme, and the Profile, which
 * lists every certificate you hold including ones an admin issued to a whole
 * cohort. One component means the printed sheet cannot drift between them.
 *
 * `cert` is whatever the API returned — /progress/certificate or an entry from
 * /certificates/mine, normalised by the caller. It carries name, program,
 * batch, issuedAt, certId, verifyUrl and qr.
 *
 * The sheet keeps its own dark palette rather than reading the app's theme
 * tokens. A credential is an artifact: it should look identical on screen, in
 * print, in a PDF and in a screenshot pasted into an application form, and a
 * certificate that changes colour with someone's theme preference is not one
 * document but several.
 */

/** "November, 2026" — the same month and year the id encodes as MMYY. */
const monthYear = (d) => {
  const dt = new Date(d);
  return `${dt.toLocaleDateString('en-US', { month: 'long' })}, ${dt.getFullYear()}`;
};

/* The programme's name as it is written out in the body copy. The LMS stores
   the short internal title ("Generalist"), while the certificate names the
   thing a reader would recognise. The guard stops "Menler AI AI Generalist …"
   if a programme is ever titled with the prefix already in it. */
function fellowshipName(program) {
  const t = String(program || '').trim();
  if (!t) return 'Menler Fellowship Program';
  if (/fellowship/i.test(t)) return t;
  return `Menler ${/^ai\b/i.test(t) ? t : `AI ${t}`} Fellowship Program`;
}

/* Who signs. Hardcoded because every certificate this LMS issues today is
   signed by the same two people; when a second mentor starts signing their own
   cohort's certificates this should move onto the programme or batch record
   rather than growing a table of special cases here. */
const SIGNATORIES = [
  { name: 'Sridevi Edupuganti', role: 'AI Generalist, Ex-Microsoft | Mentor, Menler' },
  { name: 'Sachin Roy', role: 'Founder, Menler' },
];

const PARTNERS = [
  { src: anthropicLogo, alt: 'Anthropic' },
  { src: msmeLogo, alt: 'Ministry of MSME, Government of India' },
  { src: sarvamLogo, alt: 'Sarvam AI' },
  { src: startupIndiaLogo, alt: 'Startup India' },
];

function CertificateModal({ cert, onClose }) {
  return (
    <div className="cert-overlay" onClick={onClose}>
      <div className="cert" onClick={(e) => e.stopPropagation()}>
        <div className="cert-inner">

          <header className="cert-head">
            <div className="cert-brandblock">
              <div className="cert-brand">menler<span className="cert-brand-dot">•</span></div>
              <div className="cert-tagline">Your turning point in the AI era.</div>
            </div>
            {/* Every mark is forced to flat white. Two of the four source files
                are dark artwork and would otherwise vanish into the card; the
                other two are already light but in different tints, and a row of
                partner logos in four different colours reads as clip-art. */}
            <div className="cert-partners">
              {PARTNERS.map((p) => <img key={p.alt} src={p.src} alt={p.alt} />)}
            </div>
          </header>

          <div className="cert-rule" />

          <div className="cert-kicker">Certificate of Fellowship</div>
          <p className="cert-lede">This certificate is proudly presented to</p>
          <div className="cert-name">{cert.name}</div>

          <p className="cert-body">
            for successfully completing the{' '}
            <strong>{fellowshipName(cert.program)}</strong>, demonstrating dedication to learning,
            hands-on application, and active participation throughout the program.
          </p>
          <p className="cert-body">
            We recognize their commitment to becoming an AI-Native Professional and wish them
            continued success in their journey.
          </p>

          {/* A revoked certificate must say so on its face. Someone holding a
              printed copy of one that was withdrawn should not be able to show
              it as if nothing had happened. */}
          {cert.revoked && <div className="cert-revoked">This certificate has been revoked</div>}

          <footer className="cert-foot">
            <div className="cert-idblock">
              {cert.qr && (
                <img className="cert-qr" src={cert.qr} alt={`QR code linking to ${cert.verifyUrl}`} width="74" height="74" />
              )}
              <div className="cert-idtext">
                <div className="cert-id">{cert.certId}</div>
                <div className="cert-issued">Issued on {monthYear(cert.issuedAt)}</div>
                {cert.batch && <div className="cert-issued">{cert.batch}</div>}
              </div>
            </div>

            <div className="cert-signs">
              {SIGNATORIES.map((s) => (
                <div className="cert-sign" key={s.name}>
                  <div className="cert-sign-name">{s.name}</div>
                  <div className="cert-sign-role">{s.role}</div>
                </div>
              ))}
            </div>
          </footer>

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
