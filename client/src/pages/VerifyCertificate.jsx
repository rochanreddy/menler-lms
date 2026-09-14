import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicGet } from '../api.js';

/**
 * The page behind the QR code on a certificate.
 *
 * Written for a stranger: a recruiter with a PDF in front of them, an
 * admissions officer, somebody checking a claim on a CV. They have no account,
 * they did not choose to come here, and they have exactly one question — is
 * this real? So the answer is the first thing on the page, in words, before
 * any detail.
 *
 * Four states, and they are genuinely different answers:
 *   checking   — we do not know yet
 *   valid      — yes, and here is what it says
 *   revoked    — this certificate existed and was withdrawn
 *   missing    — no certificate has ever had this id
 *   offline    — we could not ask; this is NOT evidence either way
 *
 * That last one matters. Collapsing a network failure into "not valid" would
 * tell a recruiter that a genuine certificate is fake because our server was
 * briefly down, and they would have no way to know the difference.
 */
export default function VerifyCertificate() {
  const { code } = useParams();
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    let live = true;
    publicGet(`/certificates/verify/${encodeURIComponent(code)}`).then((r) => {
      if (!live) return;
      if (r.status === 0) setState({ status: 'offline' });
      else if (r.status === 404) setState({ status: 'missing' });
      else if (r.status === 429) setState({ status: 'throttled' });
      else if (!r.ok) setState({ status: 'offline' });
      else setState({ status: r.data.revoked ? 'revoked' : 'valid', cert: r.data });
    });
    return () => { live = false; };
  }, [code]);

  const cert = state.cert;
  const issued = cert?.issuedAt
    ? new Date(cert.issuedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="vfy">
      <div className="vfy-card">
        <div className="vfy-brand">menler</div>

        {state.status === 'checking' && <p className="vfy-checking">Checking this certificate…</p>}

        {state.status === 'valid' && (
          <>
            <div className="vfy-verdict vfy-ok">
              <span className="vfy-tick" aria-hidden="true">✓</span> Verified certificate
            </div>
            <dl className="vfy-rows">
              <div><dt>Name</dt><dd>{cert.name}</dd></div>
              <div><dt>Programme</dt><dd>{cert.programme}</dd></div>
              {cert.batch && <div><dt>Batch</dt><dd>{cert.batch}</dd></div>}
              {/* Who signed it is printed on the certificate, so a verifier
                  holding the paper can check this row against it — which is
                  the whole job of this page. */}
              {cert.mentorName && <div><dt>Signed by</dt><dd>{cert.mentorName}</dd></div>}
              <div><dt>Issued</dt><dd>{issued}</dd></div>
              <div><dt>Certificate ID</dt><dd className="vfy-code">{cert.code}</dd></div>
            </dl>
            <p className="vfy-note">
              This record is held by Menler. It confirms the person named above completed the
              programme shown.
            </p>
          </>
        )}

        {state.status === 'revoked' && (
          <>
            <div className="vfy-verdict vfy-bad">Certificate revoked</div>
            <dl className="vfy-rows">
              <div><dt>Name</dt><dd>{cert.name}</dd></div>
              <div><dt>Programme</dt><dd>{cert.programme}</dd></div>
              <div><dt>Certificate ID</dt><dd className="vfy-code">{cert.code}</dd></div>
            </dl>
            <p className="vfy-note">
              This certificate was issued and has since been withdrawn by Menler. It should not be
              treated as a valid credential.
            </p>
          </>
        )}

        {state.status === 'missing' && (
          <>
            <div className="vfy-verdict vfy-bad">No such certificate</div>
            <p className="vfy-note">
              Nothing has been issued with the ID <span className="vfy-code">{code}</span>. Check
              for a typo — the ID has no letter O, I, L or U, so a character that looks like one is
              a zero, a one or something else.
            </p>
          </>
        )}

        {state.status === 'throttled' && (
          <>
            <div className="vfy-verdict vfy-warn">Too many checks</div>
            <p className="vfy-note">Give it a minute and reload. This is a limit on lookups, not a verdict on the certificate.</p>
          </>
        )}

        {state.status === 'offline' && (
          <>
            <div className="vfy-verdict vfy-warn">Could not check right now</div>
            <p className="vfy-note">
              We could not reach the records to confirm this one. That is a problem at our end —
              it does <strong>not</strong> mean the certificate is invalid. Please try again shortly.
            </p>
          </>
        )}

        <a className="vfy-home" href="https://menler.in">menler.in</a>
      </div>
    </div>
  );
}
