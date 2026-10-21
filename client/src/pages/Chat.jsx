import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import * as Ably from 'ably';
import { ChatClient, ChatMessageEventType, MessageReactionType } from '@ably/chat';
import { api } from '../api.js';
import Empty from '../components/Empty.jsx';
import { markSeen } from '../chatUnread.js';

// Batch chat. One room per batch, carried by Ably Chat end to end: messages,
// history, typing, who is online, emoji reactions and deleting your own
// message never touch this server or its database. The server only says which
// rooms you may open (GET /chat) and signs a short-lived token for them
// (POST /chat/token). See server/routes/chat.js for why.
//
// One Ably connection exists while this page is open and none otherwise, which
// is what keeps ~100 students inside the free package's 200 connections.
//
// Students post. Mentors and admins read: the page gives them no box.

const WINDOW_MS = 21 * 24 * 60 * 60 * 1000; // what a student sees; Ably purges at 30 days
const PAGE = 50;
const MAX_LEN = 1000;
const MIN_GAP_MS = 1000; // about one message a second…
const BURST = { n: 5, ms: 10_000 }; // …and no more than five in ten seconds
const GROUP_MS = 5 * 60 * 1000;
const REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '🔥'];
// The composer's picker, and "more" on a reaction. A short curated set, not a
// 3,000-emoji library: these are what a cohort actually sends, and a picker
// that needs a search box is a picker nobody opens on a phone.
const EMOJI_SETS = [
  { name: 'Smileys', list: ['😀', '😁', '😂', '🤣', '😊', '😍', '🥳', '😎', '🤩', '🤔', '😅', '🙃', '😮', '😴', '😢', '😭', '😤', '🤯', '🫠', '😇'] },
  { name: 'Hands', list: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '💪', '👋', '✌️', '👌', '🤞', '☝️', '👀', '🫡', '🤙', '✍️'] },
  { name: 'Hearts & signs', list: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🔥', '✨', '💯', '✅', '❌', '⭐', '🎉', '🚀', '⚡', '💡'] },
  { name: 'Study & work', list: ['📚', '📝', '💻', '📎', '📌', '📅', '⏰', '🧠', '🤖', '📊', '🎯', '🏆', '☕', '🎓', '🔗', '❓'] },
];

/** A grid of the sets above. `onPick` gets the emoji; the caller decides what it means. */
function EmojiGrid({ onPick, label }) {
  return (
    <div className="chat-emoji" role="dialog" aria-label={label}>
      {EMOJI_SETS.map((set) => (
        <div key={set.name} className="chat-emoji-set">
          <div className="chat-emoji-name">{set.name}</div>
          <div className="chat-emoji-grid">
            {set.list.map((e) => (
              <button key={e} type="button" onClick={() => onPick(e)} aria-label={e}>{e}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const Svg = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const SmileIcon = ({ size }) => <Svg size={size}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01" /><path d="M15 9.5h.01" /></Svg>;
const PICK_KEY = 'lms_chat_room';
// How long after sending a message its author can still edit it. Long enough
// to fix a typo or a wrong link; short enough that a reply never ends up
// answering words that are no longer there.
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const snippet = (t, n = 120) => { const one = String(t || '').replace(/\s+/g, ' ').trim(); return one.length > n ? `${one.slice(0, n - 1)}…` : one; };

const readPick = () => { try { return localStorage.getItem(PICK_KEY) || ''; } catch { return ''; } };
const writePick = (v) => { try { localStorage.setItem(PICK_KEY, v); } catch { /* storage blocked */ } };

const byTime = (a, b) => (a.timestamp - b.timestamp) || (a.serial < b.serial ? -1 : a.serial > b.serial ? 1 : 0);

/** Fold history (any order) into the list, newest copy of each serial wins. */
function merge(list, items) {
  const seen = new Map(list.map((m) => [m.serial, m]));
  for (const m of items) if (!seen.has(m.serial)) seen.set(m.serial, m);
  return [...seen.values()].sort(byTime);
}

/** Apply one live event: a new message, an edit, or a delete. */
function applyEvent(list, ev) {
  const m = ev.message;
  const i = list.findIndex((x) => x.serial === m.serial);
  if (ev.type === ChatMessageEventType.Created) return i >= 0 ? list : [...list, m].sort(byTime);
  if (i < 0) return list;
  const next = list.slice();
  try { next[i] = list[i].with(ev); } catch { next[i] = m; }
  return next;
}

const isDeleted = (m) => m.action === 'message.delete';

// A colour per person, stable across sessions, from the six course accents.
function tone(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 6) + 1;
}
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function dayLabel(d) {
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
const clock = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// http(s) and bare www. only, so nothing else ever becomes an href.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
function Linkified({ text }) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    let trail = '';
    while (/[.,!?;:)\]'"]$/.test(url)) { trail = url.slice(-1) + trail; url = url.slice(0, -1); }
    if (m.index > last) out.push(text.slice(last, m.index));
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    out.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer nofollow">{url}</a>);
    if (trail) out.push(trail);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// One to three emoji and nothing else reads better large, as it does on a phone.
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u;

const ROLE_TAG = { mentor: 'Mentor', admin: 'Menler team' };

export default function Chat() {
  const { user } = useOutletContext();
  const [data, setData] = useState({ loading: true, error: '', enabled: false, me: '', rooms: [] });
  const [pick, setPick] = useState(readPick);
  const [client, setClient] = useState(null);
  const [conn, setConn] = useState('initialized');

  useEffect(() => {
    let live = true;
    api('/chat')
      .then((d) => live && setData({ loading: false, error: '', enabled: !!d.enabled, me: d.me, rooms: d.rooms || [] }))
      .catch((e) => live && setData((s) => ({ ...s, loading: false, error: e.message })));
    return () => { live = false; };
  }, []);

  // One connection for the page, opened only when there is a room to open.
  useEffect(() => {
    if (!data.enabled || !data.me || !data.rooms.length) return undefined;
    const realtime = new Ably.Realtime({
      clientId: data.me,
      authCallback: (_params, cb) => {
        api('/chat/token', { method: 'POST' })
          .then((d) => cb(null, d.tokenRequest))
          .catch((e) => cb(e?.message || 'Could not sign in to chat.', null));
      },
    });
    const chat = new ChatClient(realtime);
    const sub = chat.connection.onStatusChange((c) => setConn(c.current));
    setClient(chat);
    return () => {
      sub.off();
      setClient(null);
      chat.dispose().catch(() => {}).finally(() => realtime.close());
    };
  }, [data.enabled, data.me, data.rooms.length]);

  const room = data.rooms.find((r) => r.room === pick) || data.rooms[0];
  const choose = useCallback((r) => { setPick(r); writePick(r); }, []);

  if (data.loading) {
    return <div className="chat-page"><div className="chat-shell is-loading"><div className="skeleton-stack"><div className="skeleton-row tall" /><div className="skeleton-row" /><div className="skeleton-row" /></div></div></div>;
  }
  if (data.error) return <div className="chat-page"><Empty icon="chat" title="Chat could not load." hint={data.error} /></div>;
  if (!data.enabled) {
    return (
      <div className="chat-page">
        <Empty
          icon="chat"
          title="Chat isn't switched on yet."
          hint={user?.role === 'admin' ? 'Add ABLY_API_KEY to the server environment and redeploy to turn it on.' : 'Your batch chat will appear here as soon as it goes live.'}
        />
      </div>
    );
  }
  if (!room) return <div className="chat-page"><Empty icon="chat" title="You're not in a batch yet." hint="Your batch chat opens once you're enrolled." /></div>;

  return (
    <div className="chat-page">
      {client
        ? <ChatRoom key={room.room} client={client} info={room} me={data.me} rooms={data.rooms} onPick={choose} conn={conn} viewerRole={user?.role} />
        : <div className="chat-shell is-loading"><div className="skeleton-stack"><div className="skeleton-row tall" /><div className="skeleton-row" /></div></div>}
    </div>
  );
}

function ChatRoom({ client, info, me, rooms, onPick, conn, viewerRole }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomError, setRoomError] = useState('');
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typers, setTypers] = useState([]);
  const [online, setOnline] = useState(new Set());
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [unseen, setUnseen] = useState(0);
  const [pickerFor, setPickerFor] = useState('');
  const [confirmDel, setConfirmDel] = useState('');
  const [moreFor, setMoreFor] = useState(''); // the full emoji grid, as a reaction
  const [composerEmoji, setComposerEmoji] = useState(false);
  const [selected, setSelected] = useState(''); // on a phone, the message whose actions are showing
  const [replyTo, setReplyTo] = useState(null); // { serial, clientId, text }
  const [editing, setEditing] = useState(null); // { serial, metadata }
  const [flashSerial, setFlashSerial] = useState(''); // the original a reply's quote just jumped to

  const roomRef = useRef(null);
  const pageRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickRef = useRef(true); // the reader is at the bottom: follow new messages
  const prependRef = useRef(0); // scrollHeight before older messages were added
  const sentRef = useRef([]);
  const noticeTimer = useRef(0);

  const nameOf = (id) => info.members[id]?.name || 'Former member';
  const roleOf = (id) => info.members[id]?.role || 'student';

  const flash = useCallback((msg) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3500);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    const subs = [];
    (async () => {
      try {
        const room = await client.rooms.get(info.room, {
          messages: { defaultMessageReactionType: MessageReactionType.Distinct },
          typing: { heartbeatThrottleMs: 5000 },
        });
        if (cancelled) return;
        roomRef.current = room;

        const msub = room.messages.subscribe((ev) => {
          setMessages((list) => applyEvent(list, ev));
          if (ev.type === ChatMessageEventType.Created && ev.message.clientId !== me && !stickRef.current) setUnseen((n) => n + 1);
        });
        subs.push(msub);
        subs.push(room.messages.reactions.subscribe((ev) => {
          setMessages((list) => list.map((m) => (m.serial === ev.messageSerial ? m.with(ev) : m)));
        }));
        subs.push(room.typing.subscribe((ev) => setTypers([...ev.currentlyTyping].filter((id) => id !== me))));
        const refreshOnline = () => room.presence.get()
          .then((ms) => { if (!cancelled) setOnline(new Set(ms.map((m) => m.clientId))); })
          .catch(() => {});
        subs.push(room.presence.subscribe(refreshOnline));

        await room.attach();
        if (cancelled) return;
        // Only the people who can talk count as "online"; a mentor reading
        // along is not someone a student is waiting on.
        if (info.canPost) await room.presence.enter().catch(() => {});
        refreshOnline();

        const page = await msub.historyBeforeSubscribe({ start: Date.now() - WINDOW_MS, limit: PAGE });
        if (cancelled) return;
        pageRef.current = page;
        setHasOlder(page.hasNext());
        stickRef.current = true;
        setMessages((list) => merge(list, page.items));
      } catch (e) {
        // 40160 is Ably refusing an operation the API key does not allow: the
        // key's capabilities in the Ably dashboard, not anything a student did.
        if (!cancelled) {
          setRoomError(e?.code === 40160
            ? 'Chat is not fully set up yet: its Ably key is missing permissions. An admin needs to fix this in the Ably dashboard.'
            : e?.message || 'This room could not be opened.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      for (const s of subs) { try { s.unsubscribe(); } catch { /* already gone */ } }
      roomRef.current = null;
      client.rooms.release(info.room).catch(() => {});
    };
  }, [client, info.room, info.canPost, me]);

  // Keep the reader where they were: at the bottom while they are there, and
  // anchored on the same message when older ones arrive above it.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prependRef.current) {
      el.scrollTop += el.scrollHeight - prependRef.current;
      prependRef.current = 0;
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typers.length]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
    stickRef.current = atBottom;
    if (atBottom && unseen) setUnseen(0);
  };

  const jumpToEnd = () => {
    const el = listRef.current;
    stickRef.current = true;
    setUnseen(0);
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  async function loadOlder() {
    if (!pageRef.current?.hasNext() || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await pageRef.current.next();
      if (page) {
        pageRef.current = page;
        setHasOlder(page.hasNext());
        prependRef.current = listRef.current?.scrollHeight || 0;
        stickRef.current = false;
        setMessages((list) => merge(list, page.items));
      } else setHasOlder(false);
    } catch { flash('Could not load earlier messages.'); }
    setLoadingOlder(false);
  }

  // Every popover closes on a click outside it or on Escape.
  const anyOpen = !!(pickerFor || confirmDel || moreFor || composerEmoji || selected);
  const closeAll = useCallback(() => { setPickerFor(''); setConfirmDel(''); setMoreFor(''); setComposerEmoji(false); setSelected(''); }, []);
  useEffect(() => {
    if (!anyOpen) return undefined;
    const outside = (e) => { if (!e.target.closest?.('.chat-tools, .chat-picker, .chat-confirm, .chat-emoji, .chat-emoji-btn, .chat-bubble, .chat-react-sheet')) closeAll(); };
    const esc = (e) => { if (e.key === 'Escape') closeAll(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [anyOpen, closeAll]);

  // Drop an emoji where the cursor is, not at the end: people add one
  // mid-sentence as often as after it.
  function insertEmoji(emoji) {
    const el = inputRef.current;
    const at = el ? el.selectionStart ?? draft.length : draft.length;
    const end = el ? el.selectionEnd ?? at : at;
    const next = draft.slice(0, at) + emoji + draft.slice(end);
    setDraft(next);
    roomRef.current?.typing.keystroke().catch(() => {});
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = at + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function copy(m) {
    closeAll();
    try { await navigator.clipboard.writeText(m.text); flash('Copied.'); }
    catch { flash('Could not copy that message.'); }
  }

  async function send() {
    const room = roomRef.current;
    const text = draft.trim();
    if (!room || !text) return;
    if (text.length > MAX_LEN) { flash(`Keep it under ${MAX_LEN} characters.`); return; }
    const now = Date.now();
    const recent = sentRef.current.filter((t) => now - t < BURST.ms);
    if ((recent.length && now - recent[recent.length - 1] < MIN_GAP_MS) || recent.length >= BURST.n) {
      flash('Slow down a little, one message a second.');
      return;
    }
    sentRef.current = [...recent, now];
    setDraft('');
    setComposerEmoji(false);
    room.typing.stop().catch(() => {});

    if (editing) {
      const target = editing;
      setEditing(null);
      try {
        // The metadata goes back as it was, or an edit would drop the quote of
        // the message it was replying to.
        const updated = await room.messages.update(target.serial, { text, metadata: target.metadata || {} }, { description: 'Edited by the author' });
        setMessages((list) => list.map((x) => { if (x.serial !== target.serial) return x; try { return x.with(updated); } catch { return updated; } }));
      } catch (e) {
        setEditing(target);
        setDraft(text);
        flash(e?.message ? `Not saved: ${e.message}` : 'Not saved. Check your connection and try again.');
      }
      inputRef.current?.focus();
      return;
    }

    const quote = replyTo;
    setReplyTo(null);
    stickRef.current = true;
    try {
      // The quote travels with the message, so it still reads after the
      // original has scrolled out of the three-week window. The name is never
      // taken from it: the page looks the author up by id.
      const metadata = quote ? { replyTo: { serial: quote.serial, clientId: quote.clientId, text: snippet(quote.text) } } : undefined;
      const sent = await room.messages.send(metadata ? { text, metadata } : { text });
      setMessages((list) => merge(list, [sent]));
    } catch (e) {
      setDraft(text);
      setReplyTo(quote);
      flash(e?.message ? `Not sent: ${e.message}` : 'Not sent. Check your connection and try again.');
    }
    inputRef.current?.focus();
  }

  function startReply(m) {
    closeAll();
    setEditing(null);
    setReplyTo({ serial: m.serial, clientId: m.clientId, text: m.text });
    inputRef.current?.focus();
  }

  function startEdit(m) {
    closeAll();
    setReplyTo(null);
    setEditing({ serial: m.serial, metadata: m.metadata || {} });
    setDraft(m.text);
    requestAnimationFrame(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  }

  function cancelCompose() {
    if (editing) setDraft('');
    setEditing(null);
    setReplyTo(null);
  }

  // A reply's quote jumps to the message it answers, if that is still loaded.
  function jumpTo(serial) {
    const el = document.getElementById(`msg-${serial}`);
    if (!el) { flash('That message is no longer in the last three weeks.'); return; }
    stickRef.current = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashSerial(serial);
    setTimeout(() => setFlashSerial((cur) => (cur === serial ? '' : cur)), 1600);
  }

  function onType(e) {
    const v = e.target.value;
    setDraft(v);
    const room = roomRef.current;
    if (!room) return;
    if (v.trim()) room.typing.keystroke().catch(() => {});
    else room.typing.stop().catch(() => {});
  }

  // Enter sends on a keyboard; on a phone the return key is a newline and the
  // button sends, which is what every messaging app has taught people.
  const touch = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches, []);
  function onKey(e) {
    if (e.key === 'Escape' && (replyTo || editing)) { e.preventDefault(); cancelCompose(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  // Grow the box with the message, up to five lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
    // No scrollbar until the box is at its full five lines: an empty box with
    // a scroll thumb in it reads as broken.
    el.style.overflowY = el.scrollHeight > 132 ? 'auto' : 'hidden';
  }, [draft]);

  async function toggleReaction(m, emoji) {
    const room = roomRef.current;
    setPickerFor('');
    setMoreFor('');
    setSelected('');
    if (!room || isDeleted(m)) return;
    const mine = m.reactions?.distinct?.[emoji]?.clientIds?.includes(me);
    try {
      if (mine) await room.messages.reactions.delete(m.serial, { name: emoji });
      else await room.messages.reactions.send(m.serial, { name: emoji });
    } catch { flash('That reaction did not go through.'); }
  }

  async function remove(m) {
    const room = roomRef.current;
    setConfirmDel('');
    if (!room) return;
    try { await room.messages.delete(m.serial, { description: 'Deleted by the author' }); }
    catch { flash('Could not delete that message.'); }
  }

  // Only what the window covers, in case a long-open page outlives it.
  const visible = messages.filter((m) => m.timestamp.getTime() >= Date.now() - WINDOW_MS);

  // Looking at the room is reading it: stamp the newest message as seen for
  // the dot on the Chat tab, now and whenever the tab comes back into view.
  const newestTs = visible.length ? visible[visible.length - 1].timestamp.getTime() : 0;
  useEffect(() => {
    if (loading || !newestTs) return undefined;
    const stamp = () => { if (document.visibilityState === 'visible') markSeen(info.room, newestTs); };
    stamp();
    document.addEventListener('visibilitychange', stamp);
    return () => document.removeEventListener('visibilitychange', stamp);
  }, [loading, newestTs, info.room]);

  const rows = [];
  visible.forEach((m, i) => {
    const prev = visible[i - 1];
    const newDay = !prev || !sameDay(prev.timestamp, m.timestamp);
    if (newDay) rows.push({ kind: 'day', key: `d-${m.serial}`, label: dayLabel(m.timestamp) });
    const head = newDay || prev.clientId !== m.clientId || m.timestamp - prev.timestamp > GROUP_MS;
    const next = visible[i + 1];
    const tail = !next || next.clientId !== m.clientId || next.timestamp - m.timestamp > GROUP_MS || !sameDay(next.timestamp, m.timestamp);
    rows.push({ kind: 'msg', key: m.serial, m, head, tail });
  });

  const typingLine = typers.length === 0 ? ''
    : typers.length === 1 ? `${nameOf(typers[0]).split(' ')[0]} is typing`
      : typers.length === 2 ? `${nameOf(typers[0]).split(' ')[0]} and ${nameOf(typers[1]).split(' ')[0]} are typing`
        : `${typers.length} people are typing`;

  const reconnecting = ['disconnected', 'suspended', 'connecting'].includes(conn) && !loading;
  const failed = conn === 'failed';
  const onlineCount = online.size;
  const left = MAX_LEN - draft.length;

  return (
    <section className="chat-shell" aria-label={`${info.name} chat`}>
      <header className="chat-head">
        <div className="chat-head-main">
          <span className={`chat-room-mark tone-${tone(info.batchId)}`} aria-hidden="true">{initials(info.program || info.name)}</span>
          <div className="chat-head-text">
            <h1 className="chat-title">{info.name}</h1>
            <p className="chat-sub">
              <span>{info.studentCount} {info.studentCount === 1 ? 'student' : 'students'}</span>
              <span className="chat-sep" aria-hidden="true">·</span>
              <span className={`chat-online ${onlineCount ? 'is-on' : ''}`}><i aria-hidden="true" />{onlineCount} online</span>
            </p>
          </div>
        </div>
        {rooms.length > 1 && (
          <label className="chat-switch">
            <span className="sr-only">Batch</span>
            <select value={info.room} onChange={(e) => onPick(e.target.value)}>
              {rooms.map((r) => <option key={r.room} value={r.room}>{r.name}</option>)}
            </select>
          </label>
        )}
      </header>

      {(reconnecting || failed) && (
        <div className={`chat-banner ${failed ? 'is-bad' : ''}`} role="status">
          {failed ? 'Chat could not connect. Refresh the page to try again.' : 'Reconnecting…'}
        </div>
      )}

      <div className="chat-scroll" ref={listRef} onScroll={onScroll}>
        <div className="chat-log" role="log" aria-live="polite" aria-relevant="additions">
          {hasOlder && (
            <div className="chat-older">
              <button type="button" className="btn sm ghost" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? 'Loading…' : 'Show earlier messages'}
              </button>
            </div>
          )}
          {!hasOlder && !loading && visible.length > 0 && (
            <p className="chat-start">This is the start of the last three weeks. Older messages are cleared automatically.</p>
          )}

          {loading && (
            <div className="chat-loading" aria-label="Loading messages">
              {[68, 44, 82, 36].map((w, i) => <div key={i} className={`chat-ghost ${i % 2 ? 'is-mine' : ''}`} style={{ width: `${w}%` }} />)}
            </div>
          )}

          {!loading && roomError && <Empty inline icon="chat" title="This room could not be opened." hint={roomError} />}

          {!loading && !roomError && visible.length === 0 && (
            <div className="chat-empty">
              <span className="chat-empty-mark" aria-hidden="true">👋</span>
              <p className="chat-empty-title">No messages in the last three weeks.</p>
              <p className="chat-empty-hint">{info.canPost ? 'Say hello to your batch.' : 'Messages will appear here as they arrive.'}</p>
            </div>
          )}

          {rows.map((r) => {
            if (r.kind === 'day') return <div key={r.key} className="chat-day"><span>{r.label}</span></div>;
            const { m, head, tail } = r;
            const mine = m.clientId === me;
            const gone = isDeleted(m);
            const role = roleOf(m.clientId);
            const reacts = Object.entries(m.reactions?.distinct || {}).filter(([, v]) => v?.total > 0);
            const quoted = m.metadata?.replyTo && typeof m.metadata.replyTo === 'object' ? m.metadata.replyTo : null;
            const big = !gone && !quoted && EMOJI_ONLY.test(m.text.trim());
            const edited = !gone && m.action === 'message.update';
            const canEdit = mine && !gone && Date.now() - m.timestamp.getTime() < EDIT_WINDOW_MS;
            return (
              <div key={r.key} id={`msg-${m.serial}`} className={`chat-row ${mine ? 'is-mine' : ''} ${head ? 'is-head' : ''} ${tail ? 'is-tail' : ''} ${selected === m.serial ? 'is-selected' : ''} ${flashSerial === m.serial ? 'is-flash' : ''}`}>
                {!mine && (
                  <div className="chat-avatar-slot">
                    {head && <span className={`chat-avatar tone-${tone(m.clientId)}`} aria-hidden="true">{initials(nameOf(m.clientId))}</span>}
                  </div>
                )}
                <div className="chat-col">
                  {head && !mine && (
                    <div className="chat-name">
                      <span className={`tone-ink-${tone(m.clientId)}`}>{nameOf(m.clientId)}</span>
                      {ROLE_TAG[role] && <span className="chat-role">{ROLE_TAG[role]}</span>}
                    </div>
                  )}
                  <div className="chat-line">
                    {/* On a phone there is no hover, so a tap on the message is
                        what shows its actions. A tap on a link still follows it. */}
                    <div
                      className={`chat-bubble ${gone ? 'is-deleted' : ''} ${big ? 'is-emoji' : ''}`}
                      onClick={(e) => {
                        if (!touch || gone || !info.canPost || e.target.closest('a')) return;
                        setPickerFor(''); setMoreFor(''); setConfirmDel('');
                        setSelected(selected === m.serial ? '' : m.serial);
                      }}
                    >
                      {!gone && quoted && (
                        <button type="button" className="chat-quote" onClick={(e) => { e.stopPropagation(); jumpTo(quoted.serial); }} title="Go to the message">
                          <b className={`tone-ink-${tone(quoted.clientId)}`}>{quoted.clientId === me ? 'You' : nameOf(quoted.clientId)}</b>
                          <span>{quoted.text || 'A message'}</span>
                        </button>
                      )}
                      {gone ? <span className="chat-deleted">Message deleted</span> : <span className="chat-text"><Linkified text={m.text} /></span>}
                      <time className="chat-time" dateTime={m.timestamp.toISOString()} title={m.timestamp.toLocaleString()}>{edited && <em>edited · </em>}{clock(m.timestamp)}</time>
                    </div>
                    {!gone && info.canPost && (
                      <div className="chat-tools" role="toolbar" aria-label="Message actions">
                        <button type="button" className="chat-tool" aria-label="React" title="React" onClick={() => { setMoreFor(''); setConfirmDel(''); setPickerFor(pickerFor === m.serial ? '' : m.serial); }}>
                          <SmileIcon />
                        </button>
                        <button type="button" className="chat-tool" aria-label="Reply" title="Reply" onClick={() => startReply(m)}>
                          <Svg><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>
                        </button>
                        {canEdit && (
                          <button type="button" className="chat-tool" aria-label="Edit message" title="Edit" onClick={() => startEdit(m)}>
                            <Svg><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>
                          </button>
                        )}
                        <button type="button" className="chat-tool" aria-label="Copy text" title="Copy" onClick={() => copy(m)}>
                          <Svg><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Svg>
                        </button>
                        {mine && (
                          <button type="button" className="chat-tool is-danger" aria-label="Delete message" title="Delete" onClick={() => { setPickerFor(''); setMoreFor(''); setConfirmDel(m.serial); }}>
                            <Svg><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></Svg>
                          </button>
                        )}
                      </div>
                    )}
                    {pickerFor === m.serial && (
                      <div className="chat-picker" role="menu" aria-label="Pick a reaction">
                        {REACTIONS.map((e) => (
                          <button key={e} type="button" role="menuitem" onClick={() => toggleReaction(m, e)}>{e}</button>
                        ))}
                        <button type="button" className="chat-picker-more" aria-label="More emojis" title="More emojis" onClick={() => { setPickerFor(''); setMoreFor(m.serial); }}>
                          <Svg size={18}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>
                        </button>
                      </div>
                    )}
                    {confirmDel === m.serial && (
                      <div className="chat-confirm" role="alertdialog" aria-label="Delete this message?">
                        <span>Delete for everyone?</span>
                        <button type="button" className="is-danger" onClick={() => remove(m)}>Delete</button>
                        <button type="button" onClick={() => setConfirmDel('')}>Cancel</button>
                      </div>
                    )}
                  </div>
                  {reacts.length > 0 && !gone && (
                    <div className="chat-reacts">
                      {reacts.map(([e, v]) => {
                        const ids = v.clientIds || [];
                        const minePick = ids.includes(me);
                        // You first, then everyone else, by first name.
                        const names = [...(minePick ? ['You'] : []), ...ids.filter((id) => id !== me).map((id) => nameOf(id).split(' ')[0])];
                        const full = [...(minePick ? ['You'] : []), ...ids.filter((id) => id !== me).map(nameOf)];
                        const hidden = Math.max(0, v.total - ids.length); // Ably clips very long lists
                        const label = v.total <= 2 && names.length === v.total ? names.join(', ') : String(v.total);
                        const who = `${full.join(', ')}${hidden ? ` and ${hidden} more` : ''} reacted with ${e}`;
                        return (
                          <button
                            key={e}
                            type="button"
                            className={`chat-react ${minePick ? 'is-mine' : ''}`}
                            data-who={who}
                            aria-label={`${who}. ${minePick ? 'Remove your reaction' : 'Add yours'}`}
                            disabled={!info.canPost}
                            onClick={() => toggleReaction(m, e)}
                          >
                            <span>{e}</span><b>{label}</b>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Only when a chip shows a count: one or two names are already on the chip. */}
                  {reacts.some(([, v]) => v.total > 2) && !gone && selected === m.serial && (
                    <div className="chat-reacted-by">
                      {reacts.map(([e, v]) => (
                        <div key={e}>
                          <span>{e}</span>
                          {[...((v.clientIds || []).includes(me) ? ['You'] : []), ...(v.clientIds || []).filter((id) => id !== me).map(nameOf)].join(', ')}
                          {v.total > (v.clientIds || []).length ? ` and ${v.total - (v.clientIds || []).length} more` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The full grid opens over the foot of the chat rather than above the
          message: above a message near the top it was clipped by the list. */}
      {moreFor && (() => {
        const target = messages.find((x) => x.serial === moreFor);
        if (!target) return null;
        return (
          <div className="chat-react-sheet">
            <div className="chat-react-sheet-head">
              <span>React to {target.clientId === me ? 'your message' : `${nameOf(target.clientId).split(' ')[0]}'s message`}</span>
              <button type="button" className="chat-tool" aria-label="Close" onClick={() => setMoreFor('')}>
                <Svg><path d="m6 6 12 12" /><path d="m18 6-12 12" /></Svg>
              </button>
            </div>
            <EmojiGrid label="React with an emoji" onPick={(e) => toggleReaction(target, e)} />
          </div>
        );
      })()}

      {unseen > 0 && (
        <button type="button" className="chat-jump" onClick={jumpToEnd}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></svg>
          {unseen === 1 ? '1 new message' : `${unseen} new messages`}
        </button>
      )}

      <footer className="chat-foot">
        <div className={`chat-typing ${typingLine ? 'is-on' : ''}`} aria-live="polite">
          {typingLine && <><span className="chat-dots" aria-hidden="true"><i /><i /><i /></span>{typingLine}</>}
        </div>
        {notice && <div className="chat-notice" role="status">{notice}</div>}
        {(replyTo || editing) && (
          <div className={`chat-context ${editing ? 'is-edit' : ''}`}>
            <Svg size={16}>{editing ? <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></> : <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>}</Svg>
            <div className="chat-context-text">
              {editing
                ? <b>Editing your message</b>
                : <><b>Replying to {replyTo.clientId === me ? 'yourself' : nameOf(replyTo.clientId)}</b><span>{snippet(replyTo.text, 90)}</span></>}
            </div>
            <button type="button" className="chat-tool" aria-label={editing ? 'Cancel editing' : 'Cancel reply'} title="Cancel (Esc)" onClick={cancelCompose}>
              <Svg><path d="m6 6 12 12" /><path d="m18 6-12 12" /></Svg>
            </button>
          </div>
        )}
        {info.canPost ? (
          <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
            {composerEmoji && <EmojiGrid label="Add an emoji" onPick={insertEmoji} />}
            <button
              type="button"
              className={`chat-emoji-btn ${composerEmoji ? 'is-on' : ''}`}
              aria-label="Add an emoji"
              aria-expanded={composerEmoji}
              title="Emoji"
              onClick={() => setComposerEmoji((v) => !v)}
              disabled={loading || !!roomError || failed}
            >
              <SmileIcon size={21} />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={onType}
              onKeyDown={onKey}
              onBlur={() => roomRef.current?.typing.stop().catch(() => {})}
              placeholder="Write a message…"
              aria-label="Message"
              maxLength={MAX_LEN + 200}
              disabled={loading || !!roomError || failed}
            />
            {left < 200 && <span className={`chat-count ${left < 0 ? 'is-over' : ''}`}>{left}</span>}
            <button type="submit" className="chat-send" aria-label={editing ? 'Save edit' : 'Send'} title={editing ? 'Save' : 'Send'} disabled={!draft.trim() || left < 0 || loading || !!roomError}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h13" /><path d="m12 5 7 7-7 7" /></svg>
            </button>
          </form>
        ) : (
          <p className="chat-readonly">
            You can read this batch's chat but not post in it.
          </p>
        )}
        <p className="chat-fine">Links only, no files. Messages are visible for three weeks.</p>
      </footer>
    </section>
  );
}
