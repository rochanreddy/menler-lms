import LineIcon from './LineIcon.jsx';

// The live-class card at the top of the student and mentor Home. One of three
// states, decided by the caller:
//   today    — the class is on today: Join (the Zoom link)
//   upcoming — the next class: when it is, and that Join appears on the day
//   (neither) — the course's last class: its recording, if there is one
// `onOpen` lets the student Home resolve a fresh link and mark attendance
// before navigating; the mentor Home just follows the link.
const whenLabel = (d) => d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayLabel = (d) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

export default function LiveClassCard({ liveClass, onOpen }) {
  const { session, today, upcoming, url } = liveClass;
  const start = new Date(session.startsAt);
  const batchName = session.batchId?.name ? ` · ${session.batchId.name.replace(/^Demo[^A-Za-z0-9]+/, '')}` : '';
  const note = (text) => <span className="live-cta-time" style={{ marginLeft: 'auto' }}>{text}</span>;

  let action;
  if (today) {
    action = url
      ? <a className="btn" href={url} target="_blank" rel="noreferrer" onClick={onOpen}><LineIcon name="video" size={17} /> Join Today&rsquo;s Live Class</a>
      : note('Link coming soon');
  } else if (upcoming) {
    action = note(`Join opens here on ${dayLabel(start)}`);
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
        <div className="live-cta-eyebrow">{today ? 'Live class today' : upcoming ? 'Next live class' : 'Last live class'}</div>
        <div className="live-cta-title">{session.title}</div>
        <div className="live-cta-time">{whenLabel(start)}{batchName}</div>
      </div>
      {action}
    </div>
  );
}
