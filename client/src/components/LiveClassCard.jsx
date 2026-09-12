import LineIcon from './LineIcon.jsx';

// The live-class card at the top of the student and mentor Home. One of three
// states, decided by the caller:
//   today    — the class is ON NOW (within its window): Join (the Zoom link)
//   upcoming — the next class: when it is, and when Join will appear
//   (neither) — the course's last class: its recording, if there is one
// `onOpen` lets the student Home resolve a fresh link and mark attendance
// before navigating; the mentor Home just follows the link.
const whenLabel = (d) => d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayLabel = (d) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const isSameDay = (a, b) => a.toDateString() === b.toDateString();

export default function LiveClassCard({ liveClass, onOpen }) {
  const { session, today, upcoming, url } = liveClass;
  const start = new Date(session.startsAt);
  const batchName = session.batchId?.name ? ` · ${session.batchId.name.replace(/^Demo[^A-Za-z0-9]+/, '')}` : '';
  // Its own class, not .live-cta-time with an inline margin: this sits in the
  // card's flex row where the Join button otherwise goes, and a flex item that
  // cannot shrink squeezes the title to one word per line on a phone.
  const note = (text) => <span className="live-cta-note">{text}</span>;

  let action;
  if (today) {
    action = url
      ? <a className="btn" href={url} target="_blank" rel="noreferrer" onClick={onOpen}><LineIcon name="video" size={17} /> Join the Live Class</a>
      : note('Link coming soon');
  } else if (upcoming) {
    // Naming the minute matters now that the button is only up for the class
    // itself: "on Sunday" was fine when it appeared at midnight, but a student
    // who reads it and checks at 4 pm for a 5 pm class would think it broken.
    const opens = liveClass.opensAt ? new Date(liveClass.opensAt) : null;
    action = note(opens && isSameDay(opens, new Date())
      ? `Join opens at ${timeLabel(opens)}`
      : `Join opens on ${dayLabel(start)}${opens ? `, ${timeLabel(opens)}` : ''}`);
  } else {
    action = url
      ? <a className="btn" href={url} target="_blank" rel="noreferrer" onClick={onOpen}><LineIcon name="video" size={17} /> Watch the Recording</a>
      : note('Recording coming soon');
  }

  return (
    <div className={`live-cta ${today ? 'is-live' : 'is-replay'}`}>
      <span className="live-cta-mark">
        {today ? <span className="path-live-pulse" /> : <LineIcon name={upcoming ? 'clock' : 'video'} size={18} />}
      </span>
      <div className="live-cta-copy">
        <div className="live-cta-eyebrow">{today ? 'Live now' : upcoming ? 'Next live class' : 'Last live class'}</div>
        <div className="live-cta-title">{session.title}</div>
        <div className="live-cta-time">{whenLabel(start)}{batchName}</div>
      </div>
      {action}
    </div>
  );
}
