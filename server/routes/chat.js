// Batch chat. One room per batch, carried entirely by Ably Chat: messages,
// history, typing, who is online, emoji reactions and "delete my own message"
// all travel between the browser and Ably. This server does two small things
// and touches no chat data:
//
//   GET  /chat        which rooms the viewer may open, and the names behind
//                     each room's member ids (Ably only ever sees an id)
//   POST /chat/token  a short-lived Ably token for exactly those rooms
//
// Why so little: the database is an Atlas M0 (100 ops/sec, shared with the
// marketing site) and chat is the one feature that would otherwise poll it all
// day. With Ably holding the history, a message costs the database nothing,
// and the server signs one token per open chat page per half hour.
//
// ── Who can do what ─────────────────────────────────────────────────────────
// Everyone in a room can post: students in every batch they are enrolled in
// (finished batches too), mentors in the batches they teach, admins in every
// batch. Staff messages carry a "Mentor" / "Menler team" tag on the page.
// Anyone can reply to a message and edit or delete their own; nobody can
// touch anyone else's.
//
// ── Retention ───────────────────────────────────────────────────────────────
// Ably Chat keeps a room's messages for 30 days and offers no way to purge
// sooner. The page asks history for the last 21 days only, so a student sees
// three weeks; day 30 is when the bytes actually go.
//
// ── Revocation ──────────────────────────────────────────────────────────────
// A token cannot be withdrawn once issued, so it is kept short: an account that
// is blocked, signed out elsewhere, or dropped from a batch loses the room when
// its token next renews (TOKEN_TTL_MS at most). requireAuth runs on every
// renewal, so the block and the single-session rules apply here unchanged.
import { Router } from 'express';
import Ably from 'ably';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { myBatchIds } from '../utils/access.js';

const router = Router();

const TOKEN_TTL_MS = 30 * 60 * 1000;

// Everything the Chat SDK needs on a room. `publish` covers sending and typing,
// `annotation-*` the emoji reactions, `channel-metadata` the occupancy count.
const ROOM_OPS = [
  'publish', 'subscribe', 'presence', 'history', 'channel-metadata',
  'annotation-publish', 'annotation-subscribe', 'message-update-own', 'message-delete-own',
];

export const roomName = (batchId) => `batch:${batchId}`;

// The key as pasted into a dashboard. Render, Vercel and friends keep a value
// exactly as typed, so a copy can arrive with a trailing space, wrapped in
// quotes, with a line break in the middle, or with its own "ABLY_API_KEY=" in front. Any of those signs tokens
// Ably rejects, and the chat page then waits on a connection that never
// comes. Cleaned here, and anything still not shaped like
// "<appId>.<keyId>:<secret>" is treated as no key, said once in the log and
// to the admin on the Chat tab, rather than signing tokens that cannot work.
const KEY_SHAPE = /^[\w-]+\.[\w-]+:[\w\-+/=]+$/;
function ablyKey() {
  const raw = String(process.env.ABLY_API_KEY || '');
  // A key never contains whitespace, so ALL of it goes, not only the ends:
  // a dashboard's wrapped text box can save a line break in the middle.
  const key = raw.replace(/\s+/g, '').replace(/^ABLY_API_KEY=/, '').replace(/^["']+|["']+$/g, '');
  return { key: KEY_SHAPE.test(key) ? key : '', set: !!raw.trim() };
}
let warned = false;
let rest = null;
let restKey = '';
const ably = () => {
  const { key, set } = ablyKey();
  if (!key) {
    if (set && !warned) { warned = true; console.error('[chat] ABLY_API_KEY is set but is not an Ably key ("appId.keyId:secret"); chat stays off.'); }
    return null;
  }
  if (!rest || restKey !== key) { rest = new Ably.Rest({ key }); restKey = key; }
  return rest;
};

/** The batches the viewer may open, with the names of the people in each. */
async function roomsFor(user) {
  const ids = await myBatchIds(user);
  if (!ids.length) return [];
  const batches = await Batch.find({ _id: { $in: ids } })
    .select('name status programId studentIds mentorIds endDate')
    .populate('programId', 'title')
    .sort({ createdAt: -1 })
    .lean();

  // One lookup for every name on every room, admins included: they can read
  // any room, and a message from one should never render as "Unknown".
  const memberIds = [...new Set(batches.flatMap((b) => [...(b.studentIds || []), ...(b.mentorIds || [])].map(String)))];
  const people = await User.find({ $or: [{ _id: { $in: memberIds } }, { role: 'admin' }] })
    .select('fullName email role')
    .lean();
  const nameOf = (u) => u.fullName || String(u.email || '').split('@')[0] || 'Member';
  const admins = people.filter((u) => u.role === 'admin');
  const byId = new Map(people.map((u) => [String(u._id), u]));

  return batches.map((b) => {
    const members = {};
    for (const id of (b.studentIds || []).map(String)) if (byId.has(id)) members[id] = { name: nameOf(byId.get(id)), role: 'student' };
    for (const id of (b.mentorIds || []).map(String)) if (byId.has(id)) members[id] = { name: nameOf(byId.get(id)), role: 'mentor' };
    for (const a of admins) members[String(a._id)] = { name: nameOf(a), role: 'admin' };
    return {
      batchId: String(b._id),
      room: roomName(b._id),
      name: b.name,
      program: b.programId?.title || '',
      status: b.status,
      studentCount: (b.studentIds || []).length,
      canPost: true,
      members,
    };
  });
}

// GET /api/lms/chat
router.get('/', requireAuth, async (req, res) => {
  const { key, set } = ablyKey();
  const rooms = await roomsFor(req.user);
  // `keyProblem` is for the admin's eyes on the Chat tab: a key that is set but
  // malformed reads differently from no key at all.
  res.json({ enabled: !!key, keyProblem: set && !key ? 'malformed' : '', me: String(req.user._id), rooms });
});

// POST /api/lms/chat/token — called by the Ably client's authCallback, on
// connect and again before each token expires.
router.post('/token', requireAuth, async (req, res) => {
  const client = ably();
  if (!client) return res.status(503).json({ error: 'Chat is not switched on yet.', code: 'chat_disabled' });

  const ids = await myBatchIds(req.user);
  if (!ids.length) return res.status(403).json({ error: 'You are not in any batch yet.' });

  // Both spellings of each room: the name the SDK is given, and the channel it
  // actually attaches ("<room>::$chat"). Naming the room alone is what Ably's
  // docs show; the channel name as well costs nothing and leaves no doubt.
  const capability = {};
  for (const id of ids) {
    capability[roomName(id)] = ROOM_OPS;
    capability[`${roomName(id)}::$chat`] = ROOM_OPS;
  }

  // Signed here with the key; no request to Ably is made.
  const tokenRequest = await client.auth.createTokenRequest({
    clientId: String(req.user._id),
    capability: JSON.stringify(capability),
    ttl: TOKEN_TTL_MS,
  });
  res.json({ tokenRequest });
});

// ── Usage, for the admin Home ───────────────────────────────────────────────
// What the Ably free package allows, against what this account has used. The
// figures are Ably's own (the key needs the Statistics capability), so they
// are the numbers Ably will hold the account to. Ably counts a message once
// on the way in and once per person it is delivered to, which is why a busy
// room's figure is many times the number of messages typed.
export const FREE_PLAN = { messagesPerMonth: 6_000_000, peakConnections: 200, peakChannels: 200 };

const STATS_TTL_MS = 5 * 60 * 1000;
let statsCache = { at: 0, body: null };

const num = (entries, key) => Number(entries?.[key] || 0);
// Every "refused" counter Ably keeps, messages and API requests alike. A
// refusal is a permission the key lacks or a limit hit, never routine.
const refusedIn = (entries) => Object.entries(entries || {})
  .filter(([k]) => /^(messages\.all\.all|apiRequests\.all)\.refused$/.test(k))
  .reduce((n, [, v]) => n + Number(v || 0), 0);

/** "2026-10-21:00" → "2026-10-21". */
const dayOf = (intervalId) => String(intervalId || '').slice(0, 10);

async function readUsage(client) {
  const [month, days] = await Promise.all([
    client.stats({ unit: 'month', limit: 1, direction: 'backwards' }),
    client.stats({ unit: 'day', limit: 14, direction: 'backwards' }),
  ]);
  const m = month.items[0]?.entries || {};
  const byDay = new Map(days.items.map((d) => [dayOf(d.intervalId), num(d.entries, 'messages.all.all.count')]));

  // Ably leaves a quiet day out entirely; the chart wants it as a zero.
  const series = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, messages: byDay.get(key) || 0 });
  }

  return {
    month: month.items[0]?.intervalId ? dayOf(month.items[0].intervalId).slice(0, 7) : new Date().toISOString().slice(0, 7),
    messages: num(m, 'messages.all.all.count'),
    peakConnections: num(m, 'connections.all.peak'),
    peakRooms: num(m, 'channels.peak'),
    activeUsers: num(m, 'mau.count'),
    refused: refusedIn(m),
    days: series,
  };
}

// GET /api/lms/chat/stats — admin only. Cached five minutes: Ably's figures
// move by the minute at most, and an admin Home opened ten times an hour
// should not be ten calls to Ably.
router.get('/stats', requireAuth, requireRole('admin'), async (_req, res) => {
  const client = ably();
  if (!client) return res.json({ enabled: false, limits: FREE_PLAN });
  const now = Date.now();
  if (statsCache.body && now - statsCache.at < STATS_TTL_MS) return res.json(statsCache.body);
  try {
    const body = { enabled: true, available: true, limits: FREE_PLAN, ...(await readUsage(client)), updatedAt: new Date(now).toISOString() };
    statsCache = { at: now, body };
    res.json(body);
  } catch (e) {
    // 40160: the key has no Statistics capability. Anything else is Ably
    // being unreachable. Either way the card says so rather than failing Home.
    res.json({
      enabled: true,
      available: false,
      limits: FREE_PLAN,
      reason: e?.code === 40160 ? 'The Ably key does not have the Statistics capability.' : 'Ably could not be reached for usage figures.',
    });
  }
});

export default router;
