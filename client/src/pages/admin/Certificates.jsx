import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { Alert, Button, Card, CardHeader, Select, Stack, Table, Text } from '../../components/ui/index.js';
import Empty from '../../components/Empty.jsx';

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
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [report, setReport] = useState(null);

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
    api(`/certificates?batchId=${batchId}`)
      .then((d) => { if (live) setCerts(d.certificates || []); })
      .catch((e) => { if (live) setErr(e.message || 'Could not load the certificates.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [batchId, reloadKey(report)]);

  const issued = certs.filter((c) => !c.revoked).length;

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
    { key: 'name', header: 'Student' },
    { key: 'email', header: 'Email' },
    { key: 'code', header: 'Certificate ID', cell: (r) => <span className="cert-id">{r.code}</span> },
    { key: 'issuedAt', header: 'Issued', cell: (r) => monthYear(r.issuedAt) },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (r.revoked
        ? <Text as="span" role="label" tone="destructive">Revoked</Text>
        : <a href={r.verifyUrl} target="_blank" rel="noreferrer">Verify ↗</a>),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (r.revoked ? null : <Button size="sm" variant="ghost" onClick={() => revoke(r)}>Revoke</Button>),
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
            {issued} issued in this batch. Issuing again is safe — anyone who already has one keeps the same code.
          </Text>

          {/* Stack is column-only; the app-wide .row is what puts two
              controls side by side and wraps them on a phone. */}
          <div className="row">
            <Button onClick={() => run(false)} disabled={!batchId || Boolean(busy)} loading={busy === 'issue'}>
              Issue certificates
            </Button>
            <Button variant="secondary" onClick={() => run(true)} disabled={!batchId || Boolean(busy)} loading={busy === 'send'}>
              Issue and email
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

      <Card padding="none">
        <Table
          caption="Certificates issued in this batch"
          columns={columns}
          rows={certs}
          rowKey={(r) => r.id}
          loading={loading}
          empty="Nothing issued for this batch yet. Press “Issue certificates” above."
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
