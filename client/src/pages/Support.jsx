import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Alert, Button, Card, Input, Select, Skeleton, Stack, Text, Textarea } from '../components/ui/index.js';

// The student's help desk: raise a problem, read the answer, reply to it.
//
// Not a dock tab. Support is where you go on the day something breaks, not a
// place you visit weekly, and a seventh permanent tab would push the six a
// student actually uses into a scroll. It lives in the account menu — where
// everyone already looks for "help" — and on the notification that announces
// a reply.
//
// Deliberately not the Forum. A doubt about the course belongs to the cohort;
// "my payment didn't go through" and "I can't log in on my new phone" belong
// to the student and the admin, and putting them on a public board is how
// people stop reporting them.
const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATE_LABEL = { open: 'With the team', answered: 'Replied', resolved: 'Resolved' };

function Thread({ ticket }) {
  return (
    <div className="sup-thread">
      {ticket.messages.map((m) => (
        <div key={m._id} className={`sup-msg ${m.authorRole === 'student' ? 'is-mine' : 'is-them'}`}>
          <div className="sup-msg-who">
            {m.authorRole === 'student' ? 'You' : m.authorName || 'Menler team'} · {when(m.createdAt)}
          </div>
          <p className="sup-msg-text">{m.text}</p>
        </div>
      ))}
    </div>
  );
}

/** One ticket, with its own reply box — replies are per ticket, so the state
 *  is too: typing into one must never appear in another. */
function Ticket({ ticket, onUpdated }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function reply(e) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await api(`/support/${ticket._id}/reply`, { method: 'POST', body: { text: text.trim() } });
      setText('');
      onUpdated(r.ticket);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <Card>
      <Stack gap="4">
        <div className="sup-head">
          <div className="sup-head-main">
            <Text role="heading-3">{ticket.subject}</Text>
            <Text role="caption" tone="muted">
              Raised {when(ticket.createdAt)} · {ticket.categoryLabel}
            </Text>
          </div>
          <span className="sup-state" data-state={ticket.status}>{STATE_LABEL[ticket.status]}</span>
        </div>

        <Thread ticket={ticket} />

        {err && <Alert tone="error">{err}</Alert>}

        <form onSubmit={reply}>
          <Stack gap="3">
            <Textarea
              label="Add to this ticket"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={ticket.status === 'resolved' ? 'Still not right? Reply and this reopens.' : 'Anything else that would help us fix it…'}
              maxLength={4000}
            />
            <div>
              <Button type="submit" size="sm" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</Button>
            </div>
          </Stack>
        </form>
      </Stack>
    </Card>
  );
}

export default function Support() {
  const [tickets, setTickets] = useState(null);
  const [categories, setCategories] = useState([]);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('access');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api('/support/mine')
      .then((d) => { if (alive) setTickets(d.tickets || []); })
      .catch((e) => { if (alive) { setTickets([]); setErr(e.message); } });
    api('/support/meta')
      .then((d) => { if (alive) setCategories(d.categories || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!subject.trim()) { setErr('Give your problem a short title.'); return; }
    if (!message.trim()) { setErr('Describe what went wrong.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api('/support', { method: 'POST', body: { subject: subject.trim(), category, message: message.trim() } });
      setTickets((list) => [r.ticket, ...(list || [])]);
      setSubject(''); setMessage(''); setComposing(false);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  const replace = (updated) => setTickets((list) => (list || []).map((t) => (t._id === updated._id ? updated : t)));
  const form = composing || (tickets && tickets.length === 0);

  return (
    <Stack gap="6">
      <div className="page-head">
        <div>
          <div className="eyebrow">Help</div>
          <Text role="heading-1">Support</Text>
          <Text role="body" tone="muted">
            Something not working — a link, your login, a payment? Tell us here. Only you and the Menler team can see it.
          </Text>
        </div>
        {!form && <Button onClick={() => setComposing(true)}>New ticket</Button>}
      </div>

      {err && <Alert tone="error">{err}</Alert>}

      {form && (
        <Card>
          <form onSubmit={submit}>
            <Stack gap="4">
              <Text role="heading-3">What went wrong?</Text>
              {tickets !== null && tickets.length === 0 && (
                <Text role="caption" tone="muted">
                  Nothing here yet — which is the good outcome. Tell us the moment it isn&rsquo;t.
                </Text>
              )}
              <Input
                label="Title"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Saturday's recording won't open"
                maxLength={160}
              />
              <Select
                label="What is it about?"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={categories.length ? categories : [{ value: 'other', label: 'Something else' }]}
              />
              <Textarea
                label="Tell us what happened"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                help="What you were doing, what you expected, and what you saw instead. Anything you can see on screen helps."
                maxLength={4000}
              />
              <div className="sup-actions">
                <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send to the team'}</Button>
                {composing && <Button variant="ghost" onClick={() => { setComposing(false); setErr(''); }}>Cancel</Button>}
              </div>
            </Stack>
          </form>
        </Card>
      )}

      {tickets === null && <Skeleton rows={3} label="Loading your tickets…" />}

      {(tickets || []).map((t) => (
        <Ticket key={t._id} ticket={t} onUpdated={replace} />
      ))}

      {tickets !== null && tickets.length > 0 && (
        <Text role="caption" tone="muted">
          Replies arrive as a notification — you don&rsquo;t have to keep this page open.
        </Text>
      )}
    </Stack>
  );
}
