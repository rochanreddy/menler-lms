// The unread dot on the Chat tab.
//
// Knowing about a new message while you are on another page normally means a
// live Ably connection on every page, which would spend the free package's 200
// concurrent connections on people who are reading a lesson. Instead, while
// the LMS tab is visible, this asks Ably's REST API for the NEWEST message of
// each of your rooms every two minutes: one message per room per request, no
// connection, nothing on our server beyond the token it already signs for
// chat. At ~100 students that is roughly 250k messages a month against the
// free 6M. A hidden tab asks nothing.
//
// "Seen" is per browser (localStorage, per room): the Chat page stamps it with
// the newest message it has shown and announces `lms:chat-seen`, so the dot
// clears the moment you look rather than at the next poll.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const POLL_MS = 2 * 60 * 1000;
const SEEN_KEY = (room) => `lms_chat_seen:${room}`;

export function readSeen(room) {
  try { return Number(localStorage.getItem(SEEN_KEY(room))) || 0; } catch { return 0; }
}

/** Called by the Chat page with the newest message timestamp it has shown. */
export function markSeen(room, ts) {
  if (!room || !ts) return;
  try {
    if (ts <= readSeen(room)) return;
    localStorage.setItem(SEEN_KEY(room), String(ts));
  } catch { /* storage blocked: the dot just clears on the next poll */ }
  window.dispatchEvent(new CustomEvent('lms:chat-seen', { detail: { room } }));
}

/**
 * Rooms with a message from someone else newer than what this browser has
 * seen. Returns a Set of room names; empty while chat is off or loading.
 */
export function useChatUnread(user) {
  const [unread, setUnread] = useState(() => new Set());
  const latest = useRef(new Map()); // room -> { ts, clientId }

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    let timer = 0;
    let rest = null;
    let rooms = [];
    let me = '';

    const recompute = () => {
      const next = new Set();
      for (const [room, m] of latest.current) {
        if (m.clientId !== me && m.ts > readSeen(room)) next.add(room);
      }
      setUnread((prev) => (prev.size === next.size && [...next].every((r) => prev.has(r)) ? prev : next));
    };

    const poll = async () => {
      if (!alive || !rest || document.visibilityState !== 'visible') return;
      await Promise.all(rooms.map(async (room) => {
        try {
          const res = await rest.request('GET', `/chat/v4/rooms/${encodeURIComponent(room)}/messages`, 4, { limit: 1, direction: 'backwards' }, null);
          const item = res.items?.[0];
          // A deleted last message is not something to come and read.
          if (item && item.action !== 'message.delete') latest.current.set(room, { ts: Number(item.timestamp) || 0, clientId: item.clientId });
          else latest.current.delete(room);
        } catch { /* one room failing must not clear the others */ }
      }));
      if (alive) recompute();
    };

    (async () => {
      try {
        const d = await api('/chat');
        if (!alive || !d.enabled || !d.rooms?.length) return;
        rooms = d.rooms.map((r) => r.room);
        me = d.me;
        const Ably = await import('ably'); // only fetched once chat is known to be on
        if (!alive) return;
        rest = new Ably.Rest({
          authCallback: (_p, cb) => {
            api('/chat/token', { method: 'POST' })
              .then((t) => cb(null, t.tokenRequest))
              .catch((e) => cb(e?.message || 'chat token failed', null));
          },
        });
        await poll();
        timer = setInterval(poll, POLL_MS);
      } catch { /* chat off or unreachable: no dot, nothing else affected */ }
    })();

    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('lms:chat-seen', recompute);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('lms:chat-seen', recompute);
    };
  }, [user?.id, user?._id]);

  return unread;
}
