import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Empty from './Empty.jsx';
import LineIcon from './LineIcon.jsx';

// Live notification bell — polls, shows an unread badge, and a dropdown.
//
// A notification that goes somewhere has to LOOK like it goes somewhere. These
// were plain paragraphs of text that happened to be buttons, so nobody clicked
// them: they get an icon, a chevron and link-coloured text. One that has no
// destination renders as a plain row instead — no pointer, no chevron — because
// a row that looks clickable and does nothing is worse than one that doesn't.
//
// The glyph is drawn here rather than carried in the text. Notifications used
// to be written with a leading emoji (📢, 🗓), which renders as a tofu box on
// any machine missing that glyph — Windows shows several of them that way. The
// stripper below also cleans the rows already stored with one.
const ICON_FOR = {
  doubt: 'chat',
  webinar: 'video',
  announcement: 'megaphone',
  assignment: 'upload',
  quiz: 'slides',
  grade: 'award',
  support: 'lifebuoy',
};

/** Drop a leading emoji from text written before the icon existed. Escapes,
 *  not the literal characters: a variation selector and a zero-width joiner
 *  are invisible in source, and a regex nobody can read is a regex nobody can
 *  safely change. */
const clean = (text) => String(text || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();

  const load = () => api('/notifications').then((d) => { setItems(d.items || []); setUnread(d.unread || 0); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function toggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unread > 0) { await api('/notifications/read', { method: 'POST' }).catch(() => {}); setUnread(0); }
  }
  function go(n) { setOpen(false); if (n.link) nav(n.link); }

  return (
    <div className="notif" ref={ref}>
      <button className="notif-btn" onClick={toggle} title="Notifications" aria-label="Notifications">
        <svg className="notif-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z" />
          <path d="M13.7 20a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-menu">
          <div className="notif-head">Notifications</div>
          {items.length === 0 && <div className="notif-empty"><Empty inline icon="forum" title="You’re all caught up." /></div>}
          {items.map((n) => {
            const body = (
              <>
                <span className="notif-mark"><LineIcon name={ICON_FOR[n.type] || 'inbox'} size={15} /></span>
                <span className="notif-body">
                  <span className="notif-text">{clean(n.text)}</span>
                  <span className="notif-time">{new Date(n.createdAt).toLocaleString()}</span>
                </span>
                {n.link && <span className="notif-go" aria-hidden="true"><LineIcon name="chevron" size={15} /></span>}
              </>
            );
            return n.link ? (
              <button key={n._id} className={`notif-item is-link ${n.read ? '' : 'unread'}`} onClick={() => go(n)}>
                {body}
              </button>
            ) : (
              <div key={n._id} className={`notif-item ${n.read ? '' : 'unread'}`}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
