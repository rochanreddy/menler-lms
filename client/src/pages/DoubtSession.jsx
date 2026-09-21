import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import Empty from '../components/Empty.jsx';
import { Alert, Button, Card, Input, Skeleton, Stack, Text, Textarea } from '../components/ui/index.js';

// The student side of a doubt session: pick a slot, say what you want to ask.
//
// One student per slot, so the grid is the form's centre of gravity rather
// than a dropdown — you can see at a glance what is left, which is the fact
// that decides whether you book at all.
//
// A taken slot shows as taken and nothing else. Who booked 7:30 is the
// admin's business; surfacing it here would turn a booking sheet into a
// register of who has doubts, which is exactly the thing that stops people
// admitting they have any.
const time = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const day = (d) => new Date(d).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

export default function DoubtSession() {
  const { user } = useOutletContext();
  const [session, setSession] = useState(undefined); // undefined = loading, null = none open
  const [slotAt, setSlotAt] = useState('');
  const [name, setName] = useState('');
  const [doubts, setDoubts] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  // Adopt whatever the server says, including after a clash — the 409 carries
  // the refreshed grid, so a student who lost a race picks again from what is
  // genuinely free instead of from a stale page.
  const adopt = useCallback((s) => {
    setSession(s);
    if (s?.booking) {
      setSlotAt(new Date(s.booking.slotAt).toISOString());
      setName(s.booking.name || '');
      setDoubts(s.booking.doubts || '');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api('/doubt-sessions/open')
      .then((d) => { if (alive) adopt(d.session || null); })
      .catch((e) => { if (alive) { setSession(null); setErr(e.message); } });
    return () => { alive = false; };
  }, [adopt]);

  // Their own name is the answer nine times out of ten, so it starts filled in
  // and stays editable for the tenth.
  useEffect(() => {
    if (session && !session.booking && !name) setName(user?.fullName || '');
  }, [session, user, name]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!slotAt) { setErr('Pick a time slot.'); return; }
    if (!name.trim()) { setErr('Your name is required.'); return; }
    setErr(''); setBusy(true); setSaved(false);
    try {
      const r = await api(`/doubt-sessions/${session._id}/book`, { method: 'POST', body: { slotAt, name: name.trim(), doubts } });
      adopt(r.session);
      setSaved(true);
    } catch (e2) {
      // A clash comes back as 409 with the fresh grid attached.
      if (e2.data?.session) { adopt(e2.data.session); setSlotAt(''); }
      setErr(e2.message);
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true); setErr(''); setSaved(false);
    try {
      const r = await api(`/doubt-sessions/${session._id}/book`, { method: 'DELETE' });
      setSession(r.session);
      setSlotAt(''); setDoubts('');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  if (session === undefined) return <Skeleton rows={4} label="Loading the doubt session…" />;

  if (!session) {
    return (
      <Stack gap="6">
        <div className="page-head">
          <div>
            <div className="eyebrow">Doubt session</div>
            <Text role="heading-1">Doubt session</Text>
          </div>
        </div>
        {err && <Alert tone="error">{err}</Alert>}
        <Empty icon="forum" title="No doubt session is open right now." hint="You’ll get a notification the moment the next one is announced." />
      </Stack>
    );
  }

  const open = session.slots.filter((s) => !s.taken && !s.past).length;
  // Your own room first: an admin sets a Meet per booked slot, because a doubt
  // slot is one student in the call. The session's link is the fallback for an
  // evening that runs on one shared room.
  const joinUrl = session.booking?.joinUrl || session.joinUrl || '';

  return (
    <Stack gap="6">
      <div className="page-head">
        <div>
          <div className="eyebrow">{day(session.startsAt)}</div>
          <Text role="heading-1">{session.title}</Text>
          <Text role="body" tone="muted">
            {time(session.startsAt)} – {time(session.endsAt)} · {session.slotMinutes} minutes each, one student per slot
          </Text>
        </div>
      </div>

      {session.message && (
        <Card>
          <Text role="body">{session.message}</Text>
        </Card>
      )}

      {session.booking && !saved && (
        <Alert tone="success" title={`You're booked for ${time(session.booking.slotAt)}`}>
          {session.booking.joinUrl
            ? 'Your meeting link is ready — join from the button below when your slot starts.'
            : 'Change your slot or what you want to ask below, any time before the session.'}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" title={`Booked — ${time(slotAt)}`}>
          See you then. You can come back and change this any time before the session.
          {' '}Your meeting link appears here once your mentor sends it.
        </Alert>
      )}

      <form onSubmit={submit}>
        <Card>
          <Stack gap="5">
            <div>
              <Text role="label">Pick a time slot</Text>
              <Text role="caption">{open} of {session.slots.length} still free.</Text>
              <div className="slot-grid">
                {session.slots.map((s) => {
                  const iso = new Date(s.at).toISOString();
                  const mine = s.mine;
                  const blocked = (s.taken && !mine) || (s.past && !mine);
                  const picked = slotAt === iso;
                  return (
                    <button
                      type="button"
                      key={iso}
                      className={`slot ${picked ? 'on' : ''} ${blocked ? 'is-gone' : ''} ${mine ? 'is-mine' : ''}`}
                      disabled={blocked}
                      aria-pressed={picked}
                      onClick={() => setSlotAt(iso)}
                    >
                      <span className="slot-time">{time(s.at)}</span>
                      <span className="slot-state">
                        {mine ? 'Yours' : s.taken ? 'Taken' : s.past ? 'Passed' : 'Free'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {open === 0 && !session.booking && (
                <Text role="caption" tone="muted">Every slot is taken. Post your question on the Forum and a mentor will pick it up there.</Text>
              )}
            </div>

            <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />

            <Textarea
              label="What do you want to clear?"
              help="The more specific you are, the more use the slot is — paste the error, name the topic, link the assignment."
              value={doubts}
              onChange={(e) => setDoubts(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="e.g. I can't get the RAG notebook to return sources — it errors on the embed step."
            />

            {err && <Alert tone="error">{err}</Alert>}

            <div className="inline-form">
              <Button type="submit" loading={busy} disabled={!slotAt}>
                {session.booking ? 'Update my booking' : 'Book this slot'}
              </Button>
              {session.booking && (
                <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel my booking</Button>
              )}
              {joinUrl && session.booking && (
                <Button variant="secondary" href={joinUrl} target="_blank" rel="noreferrer">Join link</Button>
              )}
            </div>
          </Stack>
        </Card>
      </form>
    </Stack>
  );
}
