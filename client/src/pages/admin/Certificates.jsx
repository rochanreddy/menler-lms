import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { Alert, Button, Card, CardHeader, Input, Select, Stack, Table, Text } from '../../components/ui/index.js';
import Empty from '../../components/Empty.jsx';
import CertificateModal from '../../components/CertificateModal.jsx';

/**
 * Admin: certificates, by cohort.
 *
 * Two separate actions, and the separation is the point. Issuing mints the
 * codes and lists them here; sending puts them in thirty inboxes. The first is
 * reversible in practice because nobody has seen the code yet, the second is
 * not — so they are two buttons, and an email is never the side effect of a
 * press meant to do something else.
 *
 * Issuing twice is safe and the page says so where the button is, not in a
 * tooltip: the natural thing to do when one student was added late is to press
 * the same button again, and an admin who is not sure that is safe will
 * instead go looking for a per-student control that does not exist.
 */

/** "November, 2026" — the same month and year the id encodes as MMYY. */
const monthYear = (d) => {
  const dt = new Date(d);
  return `${dt.toLocaleDateString('en-US', { month: 'long' })}, ${dt.getFullYear()}`;
};

export default function AdminCertificates() {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [certs, setCerts] = useState([]);
  // The batch's enrolled students. The table is the roster, not the list of
  // certificates — an admin about to issue needs to see who that is, and
  // "Nothing issued for this batch" answers a question nobody asked.
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [report, setReport] = useState(null);
  // The sheet an admin is looking at, fetched on demand — see the note on the
  // GET /:id route for why the QR is not on every row of the list.
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api('/batches')
      .then((d) => {
        const list = d.batches || [];
        setBatches(list);
        if (list.length) setBatchId((cur) => cur || list[0].id);
      })
      .catch((e) => setErr(e.message || 'Could not load the batches.'));
  }, []);

  useEffect(() => {
    if (!batchId) return;
    setReport(null);
    setLoading(true);
    setErr('');
    let live = true;
    Promise.all([
      api(`/certificates?batchId=${batchId}`),
      api(`/batches/${batchId}`),
    ])
      .then(([c, b]) => {
        if (!live) return;
        setCerts(c.certificates || []);
        setRoster(b.batch?.studentIds || []);
      })
      .catch((e) => { if (live) setErr(e.message || 'Could not load the batch.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [batchId, reloadKey(report)]);

  const issued = certs.filter((c) => !c.revoked).length;
  const sent = certs.filter((c) => !c.revoked && c.sentAt).length;

  /* One row per enrolled student, with their certificate if they have one.
     Then any certificate whose holder is no longer on the roster — somebody
     removed from the batch after being issued. Those must not disappear from
     this screen: the certificate still exists, still verifies, and is still
     revocable, and a row that vanishes is how an admin loses track of one. */
  const rows = useMemo(() => {
    const byStudent = new Map(certs.map((c) => [c.studentId, c]));
    const onRoster = roster.map((s) => ({
      key: s._id,
      name: s.fullName || s.email,
      email: s.email,
      cert: byStudent.get(String(s._id)) || null,
      enrolled: true,
    }));
    const seen = new Set(roster.map((s) => String(s._id)));
    const orphans = certs
      .filter((c) => !seen.has(c.studentId))
      .map((c) => ({ key: c.id, name: c.name, email: c.email, cert: c, enrolled: false }));
    return [...onRoster, ...orphans];
  }, [certs, roster]);

  async function run(send) {
    setBusy(send ? 'send' : 'issue');
    setErr('');
    try {
      setReport(await api('/certificates/issue', { method: 'POST', body: { batchId, send } }));
    } catch (e) {
      setErr(e.message || 'That did not work.');
    } finally {
      setBusy('');
    }
  }

  async function openPreview(row) {
    setErr('');
    try {
      const { certificate } = await api(`/certificates/${row.id}`);
      setPreview(certificate);
    } catch (e) {
      setErr(e.message || 'Could not load that certificate.');
    }
  }

  async function revoke(cert) {
    const reason = window.prompt(
      `Revoke ${cert.code}?\n\nIt stays verifiable and will read as revoked to anyone who scans it. Reason (optional):`,
    );
    if (reason === null) return;
    try {
      await api(`/certificates/${cert.id}/revoke`, { method: 'POST', body: { reason } });
      setReport({ revoked: cert.code });
    } catch (e) {
      setErr(e.message || 'Could not revoke it.');
    }
  }

  const columns = useMemo(() => ([
    {
      key: 'name',
      header: 'Student',
      cell: (r) => (
        <>
          {r.name}
          {/* Issued, then removed from the batch. Worth saying, because the
              certificate is still live and still theirs. */}
          {!r.enrolled && <Text as="span" role="label" tone="muted"> · no longer in this batch</Text>}
        </>
      ),
    },
    { key: 'email', header: 'Email' },
    {
      key: 'code',
      header: 'Certificate ID',
      cell: (r) => (r.cert ? <span className="cert-id">{r.cert.code}</span> : <Text as="span" role="label" tone="muted">—</Text>),
    },
    { key: 'issuedAt', header: 'Issued', cell: (r) => (r.cert ? monthYear(r.cert.issuedAt) : '—') },
    {
      key: 'status',
      header: 'Status',
      /* Three states, and they are three different things: nothing issued yet,
         issued but the student cannot see it, and delivered. */
      cell: (r) => {
        if (!r.cert) return <Text as="span" role="label" tone="muted">Not issued</Text>;
        if (r.cert.revoked) return <Text as="span" role="label" tone="destructive">Revoked</Text>;
        if (!r.cert.sentAt) return <Text as="span" role="label" tone="muted">Not sent — hidden from the student</Text>;
        return <a href={r.cert.verifyUrl} target="_blank" rel="noreferrer">Verify ↗</a>;
      },
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (r.cert ? (
        <div className="row">
          {/* View comes first and is available on revoked certificates too —
              seeing what was issued is exactly what you want when deciding
              whether a revocation was right. */}
          <Button size="sm" variant="ghost" onClick={() => openPreview(r.cert)}>View</Button>
          {!r.cert.revoked && <Button size="sm" variant="ghost" onClick={() => revoke(r.cert)}>Revoke</Button>}
        </div>
      ) : null),
    },
  ]), []);

  if (!batches.length && !err) {
    return <Empty icon="programs" title="No batches yet." hint="Create a batch and enrol students before issuing certificates." />;
  }

  const failures = report?.results?.filter((r) => r.error) || [];

  return (
    <Stack gap="6">
      <Card>
        <CardHeader>
          <Text role="heading-2">Certificates</Text>
          <Text role="caption">
            Issue to a cohort, then send. Every certificate carries a QR code anyone can scan to verify it.
          </Text>
        </CardHeader>

        <Stack gap="4">
          <Select
            label="Batch"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            options={batches.map((b) => ({ value: b.id, label: b.name }))}
          />

          <Text role="caption">
            {roster.length} {roster.length === 1 ? 'student' : 'students'} in this batch · {issued} issued · {sent} emailed.
            A certificate stays hidden from the student until it is emailed — so issue first, open one
            with <strong>View</strong> to check it reads correctly, then email. Issuing again is safe:
            anyone who already has one keeps the same code.
          </Text>

          {/* Stack is column-only; the app-wide .row is what puts two
              controls side by side and wraps them on a phone. */}
          <div className="row">
            <Button onClick={() => run(false)} disabled={!batchId || Boolean(busy)} loading={busy === 'issue'}>
              Issue certificates
            </Button>
            <Button variant="secondary" onClick={() => run(true)} disabled={!batchId || Boolean(busy)} loading={busy === 'send'}>
              Email certificates
            </Button>
          </div>

          {err && <Alert tone="error">{err}</Alert>}

          {report?.issued !== undefined && (
            <Alert tone={failures.length ? 'warning' : 'success'}>
              {report.issued} new, {report.existing} already had one
              {report.sent > 0 ? `, ${report.sent} emailed` : ''}.
              {/* Only the rows that went wrong: a list of thirty successes
                  buries the one address that bounced. */}
              {failures.length > 0 && (
                <Stack gap="2">
                  <Text role="label">Not sent</Text>
                  {failures.map((r) => (
                    <Text key={r.code} role="caption">{r.email || r.name}: {r.error}</Text>
                  ))}
                </Stack>
              )}
            </Alert>
          )}
        </Stack>
      </Card>

      <SampleCertificate batchId={batchId} onPreview={setPreview} />

      {preview && <CertificateModal cert={preview} onClose={() => setPreview(null)} />}

      <Card padding="none">
        <Table
          caption="Students in this batch, and their certificates"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          loading={loading}
          empty="No students are enrolled in this batch yet. Add them under Batches first."
        />
      </Card>
    </Stack>
  );
}

/* The table reloads whenever an issue, send or revoke reports back. Deriving a
   key from the report rather than calling load() inside each handler keeps the
   fetch in one effect, so there is a single path that can set `loading` and a
   single place a stale response is discarded. */
function reloadKey(report) {
  if (!report) return 'none';
  return report.revoked || `${report.issued}-${report.existing}-${report.sent}`;
}


/**
 * Try the certificate on for size, with any name and any address.
 *
 * Nothing here writes: no certificate row, no counter increment, no student is
 * released. The sample's id ends 0000, which the real counter can never
 * produce because it starts at 1 — so a sample cannot be mistaken for a
 * credential, and the verification page tells anyone who opens it exactly
 * that.
 *
 * It exists because the only other way to see what a cohort is about to
 * receive is to send it to them.
 */
function SampleCertificate({ batchId, onPreview }) {
  const [name, setName] = useState('Test Person');
  const [email, setEmail] = useState('team@menler.in');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);

  async function look() {
    setBusy('look');
    setNote(null);
    try {
      const { certificate } = await api('/certificates/sample', { method: 'POST', body: { name, batchId } });
      onPreview(certificate);
    } catch (e) {
      setNote({ tone: 'error', text: e.message || 'Could not build a sample.' });
    } finally {
      setBusy('');
    }
  }

  async function send() {
    setBusy('send');
    setNote(null);
    try {
      const r = await api('/certificates/sample-email', { method: 'POST', body: { name, email, batchId } });
      setNote(r.sent
        ? { tone: 'success', text: `Sample sent to ${r.to}. Its id is ${r.code} — it ends 0000, so it will not verify.` }
        : { tone: 'warning', text: r.error });
    } catch (e) {
      setNote({ tone: 'error', text: e.message || 'Could not send the sample.' });
    } finally {
      setBusy('');
    }
  }

  return (
    <Card>
      <CardHeader>
        <Text role="heading-3">Try a sample</Text>
        <Text role="caption">
          See the certificate and the email with any name on them. Nothing is issued and no student is emailed.
        </Text>
      </CardHeader>
      <Stack gap="4">
        <div className="row">
          <Input label="Name on the certificate" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Send the sample email to" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="row">
          <Button variant="secondary" onClick={look} disabled={!name.trim() || Boolean(busy)} loading={busy === 'look'}>
            Preview certificate
          </Button>
          <Button variant="secondary" onClick={send} disabled={!name.trim() || !email.trim() || Boolean(busy)} loading={busy === 'send'}>
            Send sample email
          </Button>
        </div>
        {note && <Alert tone={note.tone}>{note.text}</Alert>}
      </Stack>
    </Card>
  );
}
