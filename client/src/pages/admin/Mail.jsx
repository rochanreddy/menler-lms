import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { Alert, Badge, Button, Card, Checkbox, Dialog, Input, Radio, Select, Skeleton, Stack, Tabs, TabPanel, Text, Textarea } from '../../components/ui/index.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import Empty from '../../components/Empty.jsx';

// Admin: write a mail, pick the batches, say when — one time or several in
// the same day. The server sends it.
//
// The admin owns the SUBJECT and the BODY. The banner, the "Dear <first
// name>," greeting, the help line, the signature and the footer are the same
// shell every account mail is on (utils/emailTemplates.js) and are not
// editable here — that is what keeps a reminder from a hurried Friday looking
// like the same company as the welcome mail.
//
// No saved templates, on purpose: "Reuse" on any past mail refills the form,
// which is the whole of what a template did without a second list to tend.
//
// Send times are resolved on the admin's own clock, like classes and doubt
// sessions: "Friday 7 pm" is a fact about their calendar, and the server's
// clock is UTC. Each instant goes over the wire as ISO, and each becomes its
// own row on the server, so "the 9 am one went, the 6 pm one is waiting" is
// something the list can actually say.

const pad = (n) => String(n).padStart(2, '0');
const toLocalValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const when = (d) => (d ? new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
const timeOnly = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const MAX_TIMES = 12;
const TEST_TO_KEY = 'lms_mail_test_to';

// Copy to start from. Not saved templates — there are none, on purpose — just
// three worked examples that show what a placeholder looks like in a
// sentence, so a first test needs no writing. Picking one replaces the
// subject and body.
const EXAMPLES = [
  {
    key: 'class',
    label: 'Class reminder',
    subject: 'Class tonight · {{batch}}',
    body: 'A reminder that your {{programme}} class is tonight.\n\nThe join link is on your Home tab in the LMS about five minutes before we start. Please be on time and keep your camera on if you can.\n\nSee you in class!',
  },
  {
    key: 'assignment',
    label: 'Assignment due',
    subject: 'Your assignment is due this week',
    body: 'This week’s assignment is open in the Learning tab under Assignments & Projects.\n\nSubmit it before the deadline so your mentor can grade it and leave feedback before the next class. If you are stuck, post your doubt on the Forum — someone in {{batch}} has probably hit the same wall.',
  },
  {
    key: 'recording',
    label: 'Recording is up',
    subject: 'Recording from this week’s class',
    body: 'The recording of this week’s {{programme}} class is up on your Home tab, along with the teacher notes for the session.\n\nIf you missed the class, watch it before the next one — the next session builds on it.',
  },
];

/** Tomorrow at 9 am, as the picker's local value — a sane default for "later". */
function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalValue(d);
}

/** The next time to suggest: a few hours after the last one, on the same day
 *  where that fits — "9 am, then 1 pm, then 5 pm" is the shape of a reminder
 *  day — else the next morning. */
function nextTimeAfter(values) {
  const last = values.map((v) => new Date(v)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => b - a)[0];
  if (!last) return tomorrowMorning();
  const d = new Date(last.getTime() + 4 * 3600000);
  if (d.getDate() !== last.getDate() || d.getHours() >= 22) {
    const m = new Date(last);
    m.setDate(m.getDate() + 1);
    m.setHours(9, 0, 0, 0);
    return toLocalValue(m);
  }
  return toLocalValue(d);
}

const STATUS_LABEL = {
  scheduled: 'Scheduled',
  sending: 'Sending…',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function AdminMail() {
  const { user } = useOutletContext();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('compose');

  const [editingId, setEditingId] = useState(null); // a scheduled row being changed
  const [programId, setProgramId] = useState('');
  const [picked, setPicked] = useState([]);
  const [includeMentors, setIncludeMentors] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState('later'); // 'now' | 'later'
  const [times, setTimes] = useState(() => [tomorrowMorning()]); // picker values, local
  const [reach, setReach] = useState(null); // { count, sample }
  const [preview, setPreview] = useState(null); // { subject, html }
  const [example, setExample] = useState('');
  // Where the test copy goes. The admin account's address is rarely the inbox
  // the admin actually reads, so this is typed once and remembered.
  const [testTo, setTestTo] = useState(() => {
    try { return localStorage.getItem(TEST_TO_KEY) || user?.email || ''; } catch { return user?.email || ''; }
  });
  const bodyId = 'mail-body';

  const load = () => api('/mail').then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const batches = data?.batches || [];
  const programmes = useMemo(() => {
    const seen = new Map();
    for (const b of batches) if (b.programId && !seen.has(b.programId)) seen.set(b.programId, b.program || b.name);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [batches]);

  useEffect(() => {
    if (programId || !programmes.length) return;
    setProgramId(programmes[0].value);
  }, [programmes, programId]);

  const batchesHere = useMemo(() => batches.filter((b) => b.programId === programId), [batches, programId]);

  // Changing programme resets the selection to every batch of the new one —
  // "all Kickstarter students" is what the tab is usually opened for. Skipped
  // while a campaign is being loaded into the form, which sets both at once.
  const loadingRef = useRef(false);
  useEffect(() => {
    if (loadingRef.current) { loadingRef.current = false; return; }
    setPicked(batchesHere.map((b) => b.id));
  }, [programId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Who it will reach, from the server, since only it knows who is blocked
  // and who sits in two of the picked batches.
  useEffect(() => {
    if (!picked.length) { setReach({ count: 0, sample: [] }); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      api(`/mail/audience?batchIds=${picked.join(',')}&mentors=${includeMentors ? 1 : 0}`)
        .then((r) => { if (live) setReach(r); })
        .catch(() => { if (live) setReach(null); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [picked, includeMentors]);

  const campaigns = data?.campaigns || [];
  const placeholders = data?.placeholders || [];
  const mailOff = data && !data.mail.configured;

  // Drop a placeholder where the caret is, or at the end if the box has not
  // been focused yet.
  function insertPlaceholder(key) {
    const el = document.getElementById(bodyId);
    const token = `{{${key}}}`;
    if (!el || typeof el.selectionStart !== 'number') { setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}${token}`); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  }

  function applyExample(key) {
    setExample(key);
    const ex = EXAMPLES.find((x) => x.key === key);
    if (!ex) return;
    setSubject(ex.subject);
    setBody(ex.body);
  }

  function fillFrom(c) {
    loadingRef.current = true;
    setProgramId(batches.find((b) => c.batchIds.includes(b.id))?.programId || programId);
    setPicked(c.batchIds.filter((id) => batches.some((b) => b.id === id)));
    setIncludeMentors(!!c.includeMentors);
    setSubject(c.subject);
    setBody(c.body);
    setExample('');
    setMode('later');
    if (c.status === 'scheduled') {
      setEditingId(c._id);
      setTimes([toLocalValue(new Date(c.sendAt))]);
    } else {
      setEditingId(null);
      setTimes([tomorrowMorning()]);
    }
    setTab('compose');
    setNote('');
    setErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setSubject('');
    setBody('');
    setExample('');
    setMode('later');
    setTimes([tomorrowMorning()]);
    setIncludeMentors(false);
    setPicked(batchesHere.map((b) => b.id));
  }

  const setTimeAt = (i, v) => setTimes((ts) => ts.map((t, j) => (j === i ? v : t)));
  const removeTimeAt = (i) => setTimes((ts) => (ts.length > 1 ? ts.filter((_, j) => j !== i) : ts));
  const addTime = () => setTimes((ts) => (ts.length < MAX_TIMES ? [...ts, nextTimeAfter(ts)] : ts));

  const validTimes = times.filter((v) => v && !Number.isNaN(new Date(v).getTime()));
  const timesOk = mode === 'now' || (validTimes.length === times.length && times.length > 0);
  const sendCount = mode === 'now' ? 1 : new Set(validTimes.map((v) => new Date(v).getTime())).size;
  const totalMails = (reach?.count || 0) * sendCount;
  const canSubmit = !!subject.trim() && !!body.trim() && picked.length > 0 && timesOk && !busy;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setErr(''); setNote(''); setBusy(true);
    try {
      const base = { batchIds: picked, includeMentors, subject, body };
      if (editingId) {
        const r = await api(`/mail/campaigns/${editingId}`, { method: 'PUT', body: { ...base, sendAt: mode === 'now' ? 'now' : new Date(times[0]).toISOString() } });
        const c = r.campaign;
        if (c.status === 'sent') setNote(`Sent to ${plural(c.delivered, 'person')}${c.failed ? `, ${c.failed} failed` : ''}.`);
        else if (c.status === 'failed') setErr(c.error || 'The send failed.');
        else setNote(`Updated. Goes out ${when(c.sendAt)} to ${plural(c.recipients, 'recipient')}.`);
      } else {
        const sendAts = mode === 'now' ? ['now'] : validTimes.map((v) => new Date(v).toISOString());
        const r = await api('/mail/campaigns', { method: 'POST', body: { ...base, sendAts } });
        const rows = r.campaigns || [];
        const sent = rows.filter((c) => c.status === 'sent');
        const failed = rows.filter((c) => c.status === 'failed');
        const waiting = rows.filter((c) => c.status === 'scheduled');
        const parts = [];
        if (sent.length) parts.push(`Sent to ${plural(sent[0].delivered, 'person')}${sent[0].failed ? `, ${sent[0].failed} failed` : ''}.`);
        if (waiting.length) parts.push(`Scheduled ${plural(waiting.length, 'send')} for ${waiting.map((c) => when(c.sendAt)).join(', ')} · ${plural(waiting[0].recipients, 'recipient')} each.`);
        if (failed.length) setErr(failed[0].error || 'The send failed.');
        if (parts.length) setNote(parts.join(' '));
      }
      resetForm();
      await load();
      setTab('history');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function openPreview() {
    setErr('');
    try {
      const r = await api('/mail/preview', { method: 'POST', body: { subject, body, batchId: picked[0] || '' } });
      setPreview(r);
    } catch (e2) { setErr(e2.message); }
  }

  const testToOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim());

  async function sendTest() {
    setErr(''); setNote('');
    try {
      const r = await api('/mail/test', { method: 'POST', body: { subject, body, batchId: picked[0] || '', to: testTo.trim() } });
      try { localStorage.setItem(TEST_TO_KEY, testTo.trim()); } catch { /* private mode */ }
      setNote(`A test copy is on its way to ${r.to}.`);
    } catch (e2) { setErr(e2.message); }
  }

  async function sendNow(id) {
    setErr(''); setNote('');
    try {
      const r = await api(`/mail/campaigns/${id}/send`, { method: 'POST' });
      const c = r.campaign;
      if (c.status === 'sent') setNote(`Sent to ${plural(c.delivered, 'person')}${c.failed ? `, ${c.failed} failed` : ''}.`);
      else setErr(c.error || 'The send failed.');
      await load();
    } catch (e2) { setErr(e2.message); }
  }

  async function removeCampaign(c) {
    setErr(''); setNote('');
    try {
      const r = await api(`/mail/campaigns/${c._id}`, { method: 'DELETE' });
      setNote(r.cancelled ? 'Cancelled. Nothing will be sent.' : 'Removed from the list.');
      if (editingId === c._id) resetForm();
      await load();
    } catch (e2) { setErr(e2.message); }
  }

  const upcoming = campaigns.filter((c) => c.status === 'scheduled' || c.status === 'sending');
  const past = campaigns.filter((c) => c.status !== 'scheduled' && c.status !== 'sending');

  return (
    <Stack gap="6">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin board</div>
          <Text role="heading-1">Mail</Text>
          <Text role="body" tone="muted">Write a mail once, pick the batches, and say when it goes out — once, or several times in a day.</Text>
        </div>
      </div>

      {mailOff && (
        <Alert tone="warning">
          Email is not configured on the server (no RESEND_API_KEY or SMTP_*). Mails can be written and scheduled, but every send will fail until it is.
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'compose', label: editingId ? 'Editing a scheduled mail' : 'Compose' },
          { value: 'history', label: `Scheduled & sent${campaigns.length ? ` (${campaigns.length})` : ''}` },
        ]}
      />

      {!data && !err && <Skeleton rows={4} label="Loading the mail desk…" />}

      {/* ── Compose ─────────────────────────────────────────────────── */}
      <TabPanel value="compose" selected={tab}>
        {data && (
          <form onSubmit={submit}>
            <Card>
              <Stack gap="5">
                <div className="fb-class-head">
                  <Text role="heading-3">{editingId ? 'Change the scheduled mail' : 'New mail'}</Text>
                  {editingId && <Button size="sm" variant="ghost" onClick={resetForm}>Discard changes</Button>}
                </div>

                <div className="ds-row">
                  <Select label="Programme" value={programId} onChange={(e) => setProgramId(e.target.value)} options={programmes} />
                  <Select
                    label="Start from an example"
                    value={example}
                    onChange={(e) => applyExample(e.target.value)}
                    options={[{ value: '', label: 'Blank' }, ...EXAMPLES.map((x) => ({ value: x.key, label: x.label }))]}
                    help="Fills the subject and body below; edit them as you like."
                  />
                </div>

                <div>
                  <Text role="label">Who gets it</Text>
                  <div className="ds-batches">
                    {batchesHere.length === 0 && <Text role="caption" tone="muted">This programme has no batches yet.</Text>}
                    {batchesHere.map((b) => (
                      <Checkbox
                        key={b.id}
                        label={`${b.name} · ${plural(b.students, 'student')}`}
                        checked={picked.includes(b.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, b.id] : p.filter((x) => x !== b.id)))}
                      />
                    ))}
                  </div>
                  <div className="ds-batches">
                    <Checkbox
                      label="Also send to the batch mentors"
                      checked={includeMentors}
                      onChange={(e) => setIncludeMentors(e.target.checked)}
                    />
                  </div>
                  <Text role="caption">
                    {reach
                      ? `Will reach ${plural(reach.count, 'person')}${reach.sample?.length ? ` · ${reach.sample.join(', ')}${reach.count > reach.sample.length ? '…' : ''}` : ''}`
                      : 'Counting recipients…'}
                    {' '}— blocked accounts are skipped, and a student in two batches gets one mail.
                  </Text>
                </div>

                <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required placeholder="Class tonight · {{batch}}" />

                <div>
                  <Textarea
                    id={bodyId}
                    label="Body"
                    help="Plain text. A blank line starts a new paragraph, links become clickable. The greeting, signature and footer are added for you."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    maxLength={20000}
                    required
                  />
                  <div className="mail-placeholders">
                    <span className="mail-placeholders-label">Insert</span>
                    {placeholders.map((p) => (
                      <button type="button" key={p.key} className="mail-chip" onClick={() => insertPlaceholder(p.key)} title={`e.g. ${p.example}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Text role="label">When</Text>
                  <div className="ds-batches">
                    <Radio name="mail-when" label="Send now" checked={mode === 'now'} onChange={() => setMode('now')} />
                    <Radio name="mail-when" label={editingId ? 'Send at a time' : 'Send at these times'} checked={mode === 'later'} onChange={() => setMode('later')} />
                  </div>
                  {mode === 'later' && (
                    <div className="mail-times">
                      {times.map((v, i) => (
                        <div className="mail-time-row" key={i}>
                          <DateTimePicker value={v} onChange={(nv) => setTimeAt(i, nv)} placeholder="Date & time" />
                          {!editingId && times.length > 1 && (
                            <Button size="sm" variant="ghost" onClick={() => removeTimeAt(i)} ariaLabel="Remove this time">Remove</Button>
                          )}
                        </div>
                      ))}
                      {!editingId && (
                        <div className="inline-form">
                          <Button size="sm" variant="secondary" onClick={addTime} disabled={times.length >= MAX_TIMES}>Add another time</Button>
                          <Text role="caption" tone="muted">
                            {sendCount > 1
                              ? `${sendCount} sends · ${validTimes.map((v) => timeOnly(v)).join(', ')} · ${plural(totalMails, 'mail')} in all.`
                              : 'Your local time. The server checks once a minute, so it goes out within a minute of this.'}
                          </Text>
                        </div>
                      )}
                      {editingId && <Text role="caption" tone="muted">Your local time. Each scheduled send is its own row; to add more times, schedule a new mail.</Text>}
                    </div>
                  )}
                  {totalMails > 90 && data.mail.provider === 'resend' && (
                    <Text role="caption" tone="muted">Resend&rsquo;s free tier sends 100 mails a day. Past that, the rest fail until tomorrow.</Text>
                  )}
                </div>

                <div className="inline-form">
                  <Button type="submit" loading={busy} disabled={!canSubmit}>
                    {editingId
                      ? 'Save changes'
                      : mode === 'now'
                        ? `Send now to ${reach?.count ?? '…'}`
                        : sendCount > 1 ? `Schedule ${sendCount} sends` : 'Schedule'}
                  </Button>
                  <Button variant="secondary" onClick={openPreview} disabled={!subject.trim() && !body.trim()}>Preview</Button>
                </div>

                {/* A real copy to a real inbox — the placeholders filled with
                    the admin's own name and the first batch picked. Any
                    address, because the admin account's is rarely the inbox
                    the admin reads. */}
                <div className="inline-form">
                  <Input
                    type="email"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="you@example.com"
                    ariaLabel="Send a test copy to"
                  />
                  <Button variant="secondary" onClick={sendTest} disabled={!subject.trim() || !body.trim() || mailOff || !testToOk}>Send a test copy</Button>
                  <Text role="caption" tone="muted">One real mail to that address, marked [Test]. Ten an hour.</Text>
                </div>

                {/* The outcome sits under the buttons that caused it, where the
                    eye already is — not at the top of a page that has been
                    scrolled past. */}
                {err && <Alert tone="error">{err}</Alert>}
                {note && <Alert tone="success">{note}</Alert>}
              </Stack>
            </Card>
          </form>
        )}
      </TabPanel>

      {/* ── History ─────────────────────────────────────────────────── */}
      <TabPanel value="history" selected={tab}>
        {err && <Alert tone="error">{err}</Alert>}
        {note && <Alert tone="success">{note}</Alert>}
        {data && campaigns.length === 0 && (
          <Empty icon="mail" title="Nothing scheduled or sent yet." hint="Mails you schedule on the Compose tab show up here, with what happened to them." />
        )}

        {data && upcoming.length > 0 && (
          <Stack gap="4">
            <Text role="heading-3">Waiting to go out</Text>
            {upcoming.map((c) => <CampaignCard key={c._id} c={c} onSendNow={sendNow} onEdit={fillFrom} onRemove={removeCampaign} />)}
          </Stack>
        )}

        {data && past.length > 0 && (
          <Stack gap="4">
            <Text role="heading-3">Sent</Text>
            {past.map((c) => <CampaignCard key={c._id} c={c} onReuse={fillFrom} onRemove={removeCampaign} />)}
          </Stack>
        )}
      </TabPanel>

      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `Preview · ${preview.subject}` : 'Preview'}
        footer={<Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>}
      >
        {preview && (
          <div className="mail-preview">
            <Text role="caption" tone="muted">Rendered for you, so the placeholders are filled with your own name and the first batch picked.</Text>
            {/* sandbox with no flags: the mail's own markup renders, nothing in it can run. */}
            <iframe title="Mail preview" sandbox="" srcDoc={preview.html} />
          </div>
        )}
      </Dialog>
    </Stack>
  );
}

function CampaignCard({ c, onSendNow, onEdit, onReuse, onRemove }) {
  const [showFailures, setShowFailures] = useState(false);
  const live = c.status === 'scheduled' || c.status === 'sending';
  const line = (() => {
    if (c.status === 'scheduled') return `Goes out ${when(c.sendAt)} · ${plural(c.recipients, 'recipient')}`;
    if (c.status === 'sending') return `Sending since ${when(c.startedAt)} · ${plural(c.recipients, 'recipient')}`;
    if (c.status === 'sent') return `Sent ${when(c.finishedAt || c.sendAt)} · ${c.delivered} of ${c.recipients} delivered${c.failed ? `, ${c.failed} failed` : ''}`;
    if (c.status === 'failed') return `Failed ${when(c.finishedAt || c.sendAt)}${c.delivered ? ` · ${c.delivered} of ${c.recipients} got it` : ''}`;
    return `Cancelled ${when(c.cancelledAt)} · was due ${when(c.sendAt)}`;
  })();

  return (
    <Card>
      <Stack gap="3">
        <div className="fb-class-head">
          <div>
            <Text role="heading-3">{c.subject}</Text>
            <Text role="caption">
              {c.batches.join(', ') || 'No batch'}{c.includeMentors ? ' + mentors' : ''}
            </Text>
          </div>
          <div className="ds-actions">
            <Badge>{STATUS_LABEL[c.status] || c.status}</Badge>
            {c.status === 'scheduled' && onSendNow && <Button size="sm" onClick={() => onSendNow(c._id)}>Send now</Button>}
            {c.status === 'scheduled' && onEdit && <Button size="sm" variant="secondary" onClick={() => onEdit(c)}>Edit</Button>}
            {!live && onReuse && <Button size="sm" variant="secondary" onClick={() => onReuse(c)}>Reuse</Button>}
            {c.status !== 'sending' && <Button size="sm" variant="ghost" onClick={() => onRemove(c)}>{c.status === 'scheduled' ? 'Cancel' : 'Remove'}</Button>}
          </div>
        </div>
        <Text role="caption" tone="muted">{line}</Text>
        {c.error && <Alert tone="error">{c.error}</Alert>}
        {c.failures?.length > 0 && (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setShowFailures((v) => !v)}>
              {showFailures ? 'Hide' : 'Show'} the {plural(c.failures.length, 'address')} that failed
            </Button>
            {showFailures && (
              <ul className="mail-failures">
                {c.failures.map((f) => <li key={f.email}><strong>{f.email}</strong> — {f.error || 'send failed'}</li>)}
              </ul>
            )}
          </div>
        )}
        <pre className="mail-body-preview">{c.body}</pre>
      </Stack>
    </Card>
  );
}
