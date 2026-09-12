import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import Empty from '../../components/Empty.jsx';
import { Alert, Badge, Button, Card, Input, Skeleton, Stack, Tabs, Text, Textarea } from '../../components/ui/index.js';

// Admin: the support desk. Every problem a student has reported, and the reply.
//
// The queue defaults to everything rather than to "open", because the ticket
// most likely to have been dropped is the one answered last week that nobody
// came back to — a queue that hides it is how it stays hidden. The tab labels
// carry the counts so the size of the pile is legible before you filter it.
//
// One ticket is expanded at a time. A support desk read as a flat wall of
// threads is a wall nobody reads; the list answers "what is waiting" and the
// expansion answers "what happened", which are two different questions.
const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATE_LABEL = { open: 'Needs a reply', answered: 'Replied', resolved: 'Resolved' };

/** The thread, oldest first — the student's own words first, always. */
function Thread({ ticket }) {
  return (
    <div className="sup-thread">
      {ticket.messages.map((m) => (
        <div key={m._id} className={`sup-msg ${m.authorRole === 'admin' ? 'is-mine' : 'is-them'}`}>
          <div className="sup-msg-who">
            {m.authorRole === 'admin' ? m.authorName || 'You' : m.authorName || 'Student'} · {when(m.createdAt)}
          </div>
          <p className="sup-msg-text">{m.text}</p>
        </div>
      ))}
    </div>
  );
}

function TicketRow({ ticket, open, onToggle, onUpdated }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const act = async (fn) => {
    setBusy(true); setErr('');
    try { onUpdated((await fn()).ticket); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  async function reply(e) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    const body = { text: text.trim() };
    await act(() => api(`/support/${ticket._id}/reply`, { method: 'POST', body }));
    setText('');
  }

  return (
    <Card>
      <Stack gap="4">
        <div className="sup-head">
          <button type="button" className="sup-head-main sup-head-btn" onClick={onToggle} aria-expanded={open}>
            <Text role="heading-3">{ticket.subject}</Text>
            <Text role="caption" tone="muted">
              {ticket.student.name || ticket.student.email}
              {ticket.batch ? ` · ${ticket.batch.name}` : ''} · {ticket.categoryLabel} · {when(ticket.lastMessageAt)}
            </Text>
          </button>
          <div className="sup-head-side">
            <Badge>{ticket.messages.length} message{ticket.messages.length === 1 ? '' : 's'}</Badge>
            <span className="sup-state" data-state={ticket.status}>{STATE_LABEL[ticket.status]}</span>
          </div>
        </div>

        {!open && (
          <p className="sup-peek">{ticket.messages[0]?.text || ''}</p>
        )}

        {open && (
          <>
            <Thread ticket={ticket} />
            {err && <Alert tone="error">{err}</Alert>}
            <form onSubmit={reply}>
              <Stack gap="3">
                <Textarea
                  label="Reply to the student"
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="What you found, and what they should do next."
                  help="They get this in the app and as a notification."
                  maxLength={4000}
                />
                <div className="sup-actions">
                  <Button type="submit" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send reply'}</Button>
                  {ticket.status === 'resolved' ? (
                    <Button variant="ghost" disabled={busy} onClick={() => act(() => api(`/support/${ticket._id}`, { method: 'PATCH', body: { status: 'open' } }))}>
                      Reopen
                    </Button>
                  ) : (
                    <Button variant="secondary" disabled={busy} onClick={() => act(() => api(`/support/${ticket._id}`, { method: 'PATCH', body: { status: 'resolved' } }))}>
                      Mark resolved
                    </Button>
                  )}
                </div>
              </Stack>
            </form>
          </>
        )}
      </Stack>
    </Card>
  );
}

export default function AdminSupport() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [batchId, setBatchId] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState('');

  // The search box is debounced so typing a student's name is one query, not
  // one per keystroke; scope changes fire immediately.
  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (batchId) qs.set('batchId', batchId);
    if (q.trim()) qs.set('q', q.trim());
    api(`/support${qs.toString() ? `?${qs}` : ''}`).then(setData).catch((e) => setErr(e.message));
  }, [status, batchId, q]);

  useEffect(() => {
    setErr('');
    const id = setTimeout(load, q.trim() ? 200 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  const counts = data?.counts || { open: 0, answered: 0, resolved: 0 };
  const tickets = data?.tickets || [];

  const tabs = useMemo(() => ([
    { value: '', label: `All ${counts.open + counts.answered + counts.resolved}` },
    { value: 'open', label: `Needs a reply ${counts.open}` },
    { value: 'answered', label: `Replied ${counts.answered}` },
    { value: 'resolved', label: `Resolved ${counts.resolved}` },
  ]), [counts]);

  // A reply changes the ticket's status, so the row it lives under can change
  // while it is open. Patch it in place rather than refetching: yanking the
  // card out from under the admin who just typed into it is worse than a list
  // that is briefly one filter out of date.
  const replace = (updated) => setData((d) => (d ? { ...d, tickets: d.tickets.map((t) => (t._id === updated._id ? updated : t)) } : d));

  return (
    <Stack gap="6">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin board</div>
          <Text role="heading-1">Support</Text>
          <Text role="body" tone="muted">What students have reported, and what we told them. Mentors cannot see this.</Text>
        </div>
      </div>

      <Tabs tabs={tabs} value={status} onChange={setStatus} label="Ticket state" />

      <div className="sup-filters">
        <Input
          ariaLabel="Search tickets"
          placeholder="Search a student, a subject, a word in the thread…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(data?.batches || []).length > 1 && (
          <div className="fb-chips">
            <Text role="label">Batch</Text>
            <Button size="sm" variant={batchId ? 'ghost' : 'secondary'} onClick={() => setBatchId('')}>All</Button>
            {(data?.batches || []).map((b) => (
              <Button key={b.id} size="sm" variant={batchId === b.id ? 'secondary' : 'ghost'} onClick={() => setBatchId(b.id)}>{b.name}</Button>
            ))}
          </div>
        )}
      </div>

      {err && <Alert tone="error">{err}</Alert>}
      {!data && !err && <Skeleton rows={4} label="Loading tickets…" />}

      {data && tickets.length === 0 && (
        <Empty
          icon="support"
          title={q || status || batchId ? 'No tickets match that.' : 'Nobody has reported a problem.'}
          hint={q || status || batchId ? 'Clear the filters to see the whole desk.' : 'Students raise these from their account menu. You are notified the moment one arrives.'}
        />
      )}

      {tickets.map((t) => (
        <TicketRow
          key={t._id}
          ticket={t}
          open={openId === t._id}
          onToggle={() => setOpenId((id) => (id === t._id ? '' : t._id))}
          onUpdated={replace}
        />
      ))}
    </Stack>
  );
}
