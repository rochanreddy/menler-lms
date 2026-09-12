import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import LineIcon from './LineIcon.jsx';

// A strip on Home while a doubt session is open, saying whether you have
// booked and taking you to the form.
//
// It exists because the notification is not enough on its own: the bell is
// marked read the moment it is opened, so a student who glanced at it on
// Monday has no way back to the form by Wednesday. This is the way back.
//
// Renders nothing at all when no session is open, when the fetch fails, or for
// anyone who is not a student — Home must never be held up by this.
const time = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const day = (d) => new Date(d).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });

export default function DoubtSessionBanner() {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    api('/doubt-sessions/open')
      .then((d) => { if (alive) setSession(d.session || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!session) return null;

  const booked = !!session.booking;
  const free = session.slots.filter((s) => !s.taken && !s.past).length;

  return (
    <div className={`live-cta is-doubt ${booked ? 'is-booked' : ''}`}>
      <span className="live-cta-mark"><LineIcon name="chat" size={18} /></span>
      <div className="live-cta-copy">
        <div className="live-cta-eyebrow">{session.title} · {day(session.startsAt)}</div>
        <div className="live-cta-title">
          {booked
            ? `Your slot: ${time(session.booking.slotAt)}`
            : free === 0
              ? 'Every slot is taken'
              : `${free} slot${free === 1 ? '' : 's'} left — book one`}
        </div>
      </div>
      <button type="button" className="btn" onClick={() => navigate('/app/doubt-session')}>
        {booked ? 'Change or edit' : 'Book a slot'}
      </button>
    </div>
  );
}
