import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { Alert, Badge, Button, Card, Checkbox, Input, Select, Skeleton, Stack, Text, Textarea } from '../../components/ui/index.js';
import Empty from '../../components/Empty.jsx';

// Admin: announce a doubt session and read what came back.
//
// The push is deliberate, never automatic. There is no recurring rule that
// fires every Wednesday on its own: a notification nobody chose to send is one
// that goes out on the week the session was cancelled, and students stop
// reading the bell after the second of those.
//
// The dates are resolved HERE, not on the server. "Wednesday, 7 to 10" is a
// fact about the admin's own calendar and clock; the server's is UTC. Same
// reasoning as the bulk class scheduler.
const DEFAULT_MESSAGE = 'Weekly doubt-clearing session. Book a slot, tell us what you’re stuck on, and your mentor will come prepared to your question.';
const LENGTHS = [15, 20, 30, 45, 60];

const two = (n) => String(n).padStart(2, '0');
const timeOf = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const timeLabel = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayLabel = (d) => (d ? new Date(d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '—');

/** The next Wednesday (or today, if today is one) as YYYY-MM-DD. */
function nextWednesday() {
  const d = new Date();
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** Every slot start between `from` and `to` on `date`, as local Date objects. */
function slotsFor(date, from, to, minutes) {
  if (!date || !from || !to) return [];
  const [y, m, d] = date.split('-').map(Number);
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const start = new Date(y, m - 1, d, fh, fm);
  const end = new Date(y, m - 1, d, th, tm);
  const out = [];
  // A slot must FIT inside the window: a 7–10 evening in 30s ends at 9:30,
  // because a slot starting at 10 would run past the end of the session.
  for (let t = start.getTime(); t + minutes * 60000 <= end.getTime(); t += minutes * 60000) {
    out.push(new Date(t));
    if (out.length > 24) break;
  }
  return out;
}

/** The student's address, one click from the clipboard.
 *
 *  The admin's actual sequence is: copy this, paste it into the Meet invite,
 *  copy the link Google gives back, paste it in the box below. Re-typing an
 *  address off the screen is the step that puts the wrong person in the call.
 *
 *  navigator.clipboard is undefined on a plain-http origin, so this degrades
 *  to "select it yourself" rather than throwing. */
function CopyEmail({ email }) {
  const [state, setState] = useState('');
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('unavailable');
      await navigator.clipboard.writeText(email);
      setState('done');
      setTimeout(() => setState(''), 1600);
    } catch { setState('fail'); }
  }
  return (
    <button type="button" className="ds-slot-email" onClick={copy}>
      {email}
      <span className="ds-slot-copy">
        {state === 'done' ? 'Copied' : state === 'fail' ? 'Select it to copy' : 'Copy'}
      </span>
    </button>
  );
}

/** The meeting link for ONE booked slot — pasted after the booking exists,
 *  sent to that student alone, and re-sent when they ask where it went.
 *
 *  Not the create form's join link: that one is announced to the whole cohort
 *  before anyone has booked, and a Meet handed to a cohort is a Meet with the
 *  cohort in it. A doubt slot is one person in the room, so the room is made
 *  once the admin can see who booked it. */
function SlotLink({ sessionId, booking, onDone }) {
  const [url, setUrl] = useState(booking.joinUrl || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const saved = booking.joinUrl || '';
  const changed = url.trim() !== saved;

  async function save(value, notify) {
    if (busy) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await api(`/doubt-sessions/${sessionId}/bookings/${booking._id}`, {
        method: 'PATCH',
        body: { joinUrl: value, notify },
      });
      setUrl(value);
      setNote(r.shared ? 'Sent — it is on their doubt session page.' : value ? 'Saved, not sent.' : 'Link removed.');
      await onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="ds-slot-meet">
      <div className="ds-slot-meet-row">
        <Input
          ariaLabel={`Meeting link for ${booking.name}`}
          placeholder="https://meet.google.com/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={500}
        />
        <Button size="sm" loading={busy} disabled={!url.trim()} onClick={() => save(url.trim(), true)}>
          {booking.joinSharedAt && !changed ? 'Send again' : 'Send link'}
        </Button>
        {saved && !changed && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save('', false)}>Remove</Button>
        )}
      </div>
      {err
        ? <Text role="caption" tone="destructive">{err}</Text>
        : note
          ? <Text role="caption">{note}</Text>
          : (
            <Text role="caption" tone="muted">
              {booking.joinSharedAt
                ? `Sent ${new Date(booking.joinSharedAt).toLocaleString()}${changed ? ' · unsaved changes' : ''}`
                : 'Not sent yet — they see no link until you send one.'}
            </Text>
          )}
    </div>
  );
}

export default function AdminDoubts() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [programId, setProgramId] = useState('');
  const [picked, setPicked] = useState([]); // batch ids
  const [date, setDate] = useState(nextWednesday);
  const [from, setFrom] = useState('19:00');
  const [to, setTo] = useState('22:00');
  const [minutes, setMinutes] = useState(30);
  const [title, setTitle] = useState('Doubt session');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [joinUrl, setJoinUrl] = useState('');

  const load = () => api('/doubt-sessions').then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const batches = data?.batches || [];
  const programmes = useMemo(() => {
    const seen = new Map();
    for (const b of batches) if (b.programId && !seen.has(b.programId)) seen.set(b.programId, b.program || b.name);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [batches]);

  // Default to Generalist — it is the programme this was built for — and fall
  // back to the first programme if it is ever renamed.
  useEffect(() => {
    if (programId || !programmes.length) return;
    setProgramId(programmes.find((p) => /generalist/i.test(p.label))?.value || programmes[0].value);
  }, [programmes, programId]);

  const batchesHere = useMemo(() => batches.filter((b) => b.programId === programId), [batches, programId]);

  // Changing programme invalidates the selection; every cohort of the new one
  // is the sane default, since that is what "all Generalist students" means.
  useEffect(() => { setPicked(batchesHere.map((b) => b.id)); }, [programId]); // eslint-disable-line react-hooks/exhaustive-deps

  const slots = useMemo(() => slotsFor(date, from, to, minutes), [date, from, to, minutes]);
  const reach = batchesHere.filter((b) => picked.includes(b.id)).reduce((n, b) => n + b.students, 0);

  async function push(e) {
    e.preventDefault();
    if (busy) return;
    if (!picked.length) { setErr('Pick at least one batch.'); return; }
    if (!slots.length) { setErr('That window has no room for a single slot.'); return; }
    setErr(''); setNote(''); setBusy(true);
    try {
      const r = await api('/doubt-sessions', {
        method: 'POST',
        body: {
          programId,
          batchIds: picked,
          slotsAt: slots.map((d) => d.toISOString()),
          slotMinutes: minutes,
          title: title.trim() || 'Doubt session',
          message,
          joinUrl: joinUrl.trim(),
        },
      });
      setNote(`Pushed to ${r.notified} student${r.notified === 1 ? '' : 's'}.`);
      await load();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function repush(id) {
    setErr(''); setNote('');
    try {
      const r = await api(`/doubt-sessions/${id}/notify`, { method: 'POST' });
      setNote(`Reminder pushed to ${r.notified} student${r.notified === 1 ? '' : 's'}.`);
      await load();
    } catch (e2) { setErr(e2.message); }
  }

  async function cancel(id) {
    setErr(''); setNote('');
    try {
      await api(`/doubt-sessions/${id}`, { method: 'DELETE' });
      setNote('Cancelled — it has disappeared from the students’ view.');
      await load();
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <Stack gap="6">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin board</div>
          <Text role="heading-1">Doubts</Text>
          <Text role="body" tone="muted">Announce a doubt session, and read what students booked it to ask.</Text>
        </div>
      </div>

      {err && <Alert tone="error">{err}</Alert>}
      {note && <Alert tone="success">{note}</Alert>}

      <form onSubmit={push}>
        <Card>
          <Stack gap="5">
            <Text role="heading-3">Push a notification</Text>

            <div className="ds-row">
              <Select label="Programme" value={programId} onChange={(e) => setProgramId(e.target.value)} options={programmes} />
              <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              <Input label="From" type="time" value={from} onChange={(e) => setFrom(e.target.value)} required />
              <Input label="To" type="time" value={to} onChange={(e) => setTo(e.target.value)} required />
              <Select
                label="Each slot"
                value={String(minutes)}
                onChange={(e) => setMinutes(Number(e.target.value))}
                options={LENGTHS.map((n) => ({ value: String(n), label: `${n} min` }))}
              />
            </div>

            <div>
              <Text role="label">Who gets it</Text>
              <div className="ds-batches">
                {batchesHere.length === 0 && <Text role="caption" tone="muted">This programme has no batches yet.</Text>}
                {batchesHere.map((b) => (
                  <Checkbox
                    key={b.id}
                    label={`${b.name} · ${b.students} student${b.students === 1 ? '' : 's'}`}
                    checked={picked.includes(b.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, b.id] : p.filter((x) => x !== b.id)))}
                  />
                ))}
              </div>
              <Text role="caption">
                {reach} student{reach === 1 ? '' : 's'} will get the notification · {slots.length} slot{slots.length === 1 ? '' : 's'}
                {slots.length > 0 && ` (${timeOf(slots[0])} to ${timeOf(new Date(slots[slots.length - 1].getTime() + minutes * 60000))})`}
              </Text>
            </div>

            {/* The slots as they will appear to a student — the window is easy
                to get wrong by half an hour, and this is cheaper than finding
                out from the bookings. */}
            {slots.length > 0 && (
              <div className="slot-grid is-preview">
                {slots.map((d) => (
                  <span className="slot" key={d.toISOString()}>
                    <span className="slot-time">{timeLabel(d)}</span>
                    <span className="slot-state">Free</span>
                  </span>
                ))}
              </div>
            )}

            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            <Textarea
              label="The write-up"
              help="Shown in the notification and above the booking form."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={2000}
            />
            <Input
              label="Shared join link (optional)"
              help="One room for the whole evening, shown to everyone who books. For a Meet per student, leave this empty and send a link on their slot below once they have booked."
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
              placeholder="https://zoom.us/j/…"
            />

            <div className="inline-form">
              <Button type="submit" loading={busy} disabled={!picked.length || !slots.length}>
                Push notification to {reach} student{reach === 1 ? '' : 's'}
              </Button>
            </div>
          </Stack>
        </Card>
      </form>

      {!data && !err && <Skeleton rows={3} label="Loading doubt sessions…" />}

      {data && data.sessions.length === 0 && (
        <Empty icon="forum" title="No doubt session announced yet." hint="Push one above and it lands in every invited student’s notifications." />
      )}

      {(data?.sessions || []).map((s) => (
        <Card key={s._id}>
          <Stack gap="4">
            <div className="fb-class-head">
              <div>
                <Text role="heading-3">{s.title}</Text>
                <Text role="caption">
                  {dayLabel(s.startsAt)} · {timeLabel(s.startsAt)}–{timeLabel(s.endsAt)} · {s.batches.join(', ') || 'No batch'}
                </Text>
              </div>
              <div className="ds-actions">
                {s.cancelledAt
                  ? <Badge>Cancelled</Badge>
                  : <Badge>{s.booked} of {s.slots.length} booked</Badge>}
                {!s.cancelledAt && <Button size="sm" variant="secondary" onClick={() => repush(s._id)}>Push again</Button>}
                {!s.cancelledAt && <Button size="sm" variant="ghost" onClick={() => cancel(s._id)}>Cancel</Button>}
              </div>
            </div>

            <Text role="caption" tone="muted">
              {s.notifiedAt
                ? `Last pushed ${new Date(s.notifiedAt).toLocaleString()} to ${s.notifiedCount} of ${s.invited} invited${s.pushes > 1 ? ` · ${s.pushes} pushes` : ''}`
                : 'Not pushed yet.'}
            </Text>

            {/* Every slot, empty ones included: the gaps are half the point of
                looking at this page before the session starts. */}
            <div className="ds-sheet">
              {s.slots.map((slot) => (
                <div className={`ds-slot ${slot.booking ? 'is-booked' : ''}`} key={slot.at}>
                  <div className="ds-slot-time">{timeLabel(slot.at)}</div>
                  {slot.booking ? (
                    <div className="ds-slot-body">
                      <div className="ds-slot-who">
                        <strong>{slot.booking.name}</strong>
                        {slot.booking.student.email && <CopyEmail email={slot.booking.student.email} />}
                      </div>
                      {slot.booking.doubts
                        ? <Text role="body">{slot.booking.doubts}</Text>
                        : <Text role="caption" tone="muted">No question written.</Text>}
                      {!s.cancelledAt && (
                        <SlotLink sessionId={s._id} booking={slot.booking} onDone={load} />
                      )}
                    </div>
                  ) : (
                    <div className="ds-slot-body"><Text role="caption" tone="muted">Free</Text></div>
                  )}
                </div>
              ))}
            </div>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
