import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import LineIcon from '../../components/LineIcon.jsx';
import Empty from '../../components/Empty.jsx';

// Webinars — admin schedules; mentors and students join. One page for all
// three roles: the list is identical, only the scheduling form is an admin's.
//
// Masterclasses are not batch-scoped. A guest session on evaluating RAG is
// worth the same to a Kickstarter student as to a Generalist one, so every
// signed-in learner sees every webinar — which is also why the page needs no
// batch filter.
//
// Split upcoming from past rather than listing by date alone. A student opens
// this to answer "what's next and how do I get in"; the archive is a different
// question, asked less often, and answered further down the page.
export default function Webinar() {
  const { user } = useOutletContext();
  const canAdd = user.role === 'admin';
  const [webinars, setWebinars] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ title: '', startsAt: '', joinUrl: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api('/webinars')
    .then((d) => setWebinars(d.webinars || []))
    .catch(() => {})
    .finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!form.title.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/webinars', { method: 'POST', body: { ...form, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null } });
      setForm({ title: '', startsAt: '', joinUrl: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  const whenLabel = (iso) => new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const now = Date.now();
  // A webinar with no date yet is still ahead of you, not behind you.
  const isPast = (w) => !!w.startsAt && new Date(w.startsAt).getTime() < now;
  const { upcoming, past } = useMemo(() => ({
    // Soonest first among the upcoming; most recent first among the archive.
    upcoming: webinars.filter((w) => !isPast(w)).sort((a, b) => new Date(a.startsAt || 8.64e15) - new Date(b.startsAt || 8.64e15)),
    past: webinars.filter(isPast).sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt)),
  }), [webinars, now]); // eslint-disable-line react-hooks/exhaustive-deps

  // One action owns the card, and clicking anywhere on the row runs it: the
  // join link while the session is ahead of you, the recording once it is
  // behind you, the slides if that is all there is. A masterclass row has one
  // obvious purpose, so hunting for a small word on the right of it is work
  // the card can do for you. `row-link` is what stretches that one link across
  // the panel; any other action stays clickable in its own right.
  const leadAction = (w) => {
    if (!isPast(w) && w.joinUrl) return 'join';
    if (w.recordingUrl) return 'recording';
    if (w.pptUrl) return 'slides';
    return null;
  };

  const row = (w) => {
    const past_ = isPast(w);
    const lead = leadAction(w);
    return (
      <div key={w._id} className={`panel list-row ${lead ? 'is-linked' : ''}`}>
        <div>
          <strong>{w.title}</strong>{' '}
          <span className={`badge ${past_ ? 'badge-muted' : 'badge-student'}`}>{past_ ? 'past' : 'upcoming'}</span>
          <div className="muted">{w.startsAt ? whenLabel(w.startsAt) : 'Date to be announced'}</div>
        </div>
        <div className="row">
          {w.joinUrl && !past_ && (
            <a className={`btn sm ${lead === 'join' ? 'row-link' : ''}`} href={w.joinUrl} target="_blank" rel="noreferrer">
              <LineIcon name="video" size={14} /> Join
            </a>
          )}
          {w.pptUrl && (
            <a className={`btn sm quiet ${lead === 'slides' ? 'row-link' : ''}`} href={w.pptUrl} target="_blank" rel="noreferrer">
              <LineIcon name="slides" size={14} /> Slides
            </a>
          )}
          {/* Ghost rather than solid: four archived masterclasses in a column
              are a list to browse, not four things to do right now. */}
          {w.recordingUrl && (
            <a className={`btn sm ghost ${lead === 'recording' ? 'row-link' : ''}`} href={w.recordingUrl} target="_blank" rel="noreferrer">
              <LineIcon name="video" size={14} /> Watch recording
            </a>
          )}
          {/* Said plainly rather than left as an empty row: a past masterclass
              with nothing attached looks like a broken link otherwise. */}
          {past_ && !w.recordingUrl && !w.pptUrl && <span className="muted">No recording yet</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Webinars</div>
          <h1>Live masterclasses</h1>
          <p>{canAdd ? 'Upcoming sessions, slides and recordings.' : 'Open to every Menler student — join live, or catch the recording after.'}</p>
        </div>
      </div>

      {canAdd && (
        <form className="panel" onSubmit={add}>
          <h3>Schedule a webinar</h3>
          <div className="inline-form">
            <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <DateTimePicker value={form.startsAt} onChange={(v) => setForm((f) => ({ ...f, startsAt: v }))} placeholder="Starts at" />
            <input placeholder="Join link" value={form.joinUrl} onChange={(e) => setForm((f) => ({ ...f, joinUrl: e.target.value }))} />
            <button className={`btn sm ${busy ? 'is-busy' : ''}`} disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
          </div>
          <p className="muted">Every student is notified as soon as you add it. Mentors see it on this tab.</p>
          {err && <span className="error" role="alert">{err}</span>}
        </form>
      )}

      {upcoming.length > 0 && (
        <>
          <h3 className="ruled-head">Coming up</h3>
          <div className="list">{upcoming.map(row)}</div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h3 className="ruled-head">Past masterclasses</h3>
          <div className="list">{past.map(row)}</div>
        </>
      )}

      {loaded && webinars.length === 0 && (
        <div className="list">
          <Empty
            inline
            icon="webinar"
            title="No webinars scheduled yet."
            hint={canAdd
              ? 'Add one above and it appears for everyone here, and every student is notified.'
              : 'When a masterclass is scheduled you’ll get a notification, and it will show up here.'}
          />
        </div>
      )}
    </div>
  );
}
