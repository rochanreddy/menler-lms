import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import anthropicLogo from '../assets/certificate/anthropic.png';
import msmeLogo from '../assets/certificate/msme.png';
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
  if (/fellowship/i.test(t)) return /^menler\b/i.test(t) ? t : `Menler ${t}`;
  return `Menler ${/^ai\b/i.test(t) ? t : `AI ${t}`} Fellowship Program`;
}

/* The founder signs every certificate; the other signature is the mentor who
   actually taught the cohort, carried on the certificate itself (see
   mentorFor() on the server) so it is whoever was assigned to that batch at
   the time rather than whoever is assigned now.

   A batch with no mentor assigned gets the founder alone. One signature and an
   empty line beside it looks like a rendering fault; one signature looks
   deliberate. */
const FOUNDER = { name: 'Sachin Roy', role: 'Founder, Menler' };

const signatoriesFor = (cert) => (cert.mentorName
  ? [{ name: cert.mentorName, role: cert.mentorRole || 'Mentor, Menler' }, FOUNDER]
  : [FOUNDER]);

/* Per-logo height, because a shared one does not make a row look even.
   These four marks have wildly different proportions once their transparent
   padding is trimmed off — Anthropic is a 9:1 wordmark, sarvam a 1:1 symbol —
   so setting them all to the same height leaves the wordmark a thin sliver
   beside a chunky square. The numbers below are tuned by eye for equal
   optical weight, the same way LogoStrip does it on the marketing site.

   The files are pre-trimmed, so the height here is the artwork itself rather
   than the artwork plus whatever whitespace its exporter happened to bake in. */
const PARTNERS = [
  { src: anthropicLogo, alt: 'Anthropic', h: 13 },
  { src: msmeLogo, alt: 'Ministry of MSME, Government of India', h: 34 },
  // A symbol, not a wordmark, and a square mark always reads smaller than a
  // line of type at the same height — so it gets close to the tallest.
  { src: sarvamLogo, alt: 'Sarvam AI', h: 32 },
  { src: startupIndiaLogo, alt: 'Startup India', h: 17 },
];

/* The sheet has one layout: landscape, designed at this width. A narrow screen
   gets the same sheet scaled down rather than a reflowed portrait version, so
   what a student sees on their phone is what prints and what they share. */
const SHEET_WIDTH = 940;
const OVERLAY_GUTTER = 40; // .cert-overlay's padding, both sides

function useSheetScale() {
  const fit = () => (typeof window === 'undefined'
    ? 1
    : Math.min(1, Math.max(0.2, (window.innerWidth - OVERLAY_GUTTER) / SHEET_WIDTH)));
  const [scale, setScale] = useState(fit);
  useEffect(() => {
    const onResize = () => setScale(fit());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

function CertificateModal({ cert, onClose }) {
  const scale = useSheetScale();
  /* Portalled to <body> so print can drop everything else outright. Hiding the
     page with `visibility` kept its height, which printed as three pages, and
     a fixed overlay prints on every one of them — three copies of the sheet. */
  return createPortal(
    <div className="cert-overlay" onClick={onClose}>
      {/* Only the sheet is scaled: the buttons under it stay full size, or on a
          phone they would shrink to a third of a tap target. */}
      <div className="cert" style={{ width: SHEET_WIDTH * scale }} onClick={(e) => e.stopPropagation()}>
        <div className="cert-inner" style={{ zoom: scale }}>

          <header className="cert-head">
            <div className="cert-brandblock">
                {/* The wordmark exactly as merdian- draws it (MenlerWordmark.jsx):
                  the purple rule runs under "menle" only, not the whole word,
                  and the dot is the brand green #1D9E75 rather than the violet
                  accent. Rebuilt here rather than imported because that
                  component lives in a different repo. */}
              <div className="cert-brand">
                <span className="cert-brand-ruled">menle</span>r
                <span className="cert-brand-dot" />
              </div>
              <div className="cert-tagline">Your turning point in the AI era.</div>
            </div>
            {/* Every mark is forced to flat white. Two of the four source files
                are dark artwork and would otherwise vanish into the card; the
                other two are already light but in different tints, and a row of
                partner logos in four different colours reads as clip-art. */}
            <div className="cert-partners">
              {PARTNERS.map((p) => <img key={p.alt} src={p.src} alt={p.alt} style={{ height: p.h }} />)}
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
              {signatoriesFor(cert).map((s) => (
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
    </div>,
    document.body,
  );
}

export default CertificateModal;
