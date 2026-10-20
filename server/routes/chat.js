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
// A student chats in every batch they are enrolled in, finished batches too.
// Mentors (their own batches) and admins (every batch) can READ. Their
// read-only-ness is the page's, not the token's: Ably attaches a room asking
// for publish, and typing indicators are publishes, so a token without publish
// cannot open the room at all. Staff are trusted; the page gives them no box.
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
import { requireAuth } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { myBatchIds } from '../utils/access.js';

const router = Router();

const TOKEN_TTL_MS = 30 * 60 * 1000;

// Everything the Chat SDK needs on a room. `publish` covers sending and typing,
// `annotation-*` the emoji reactions, `channel-metadata` the occupancy count.
const ROOM_OPS = [
  'publish', 'subscribe', 'presence', 'history', 'channel-metadata',
  'annotation-publish', 'annotation-subscribe', 'message-delete-own',
];

export const roomName = (batchId) => `batch:${batchId}`;

let rest = null;
const ably = () => {
  if (!process.env.ABLY_API_KEY) return null;
  if (!rest) rest = new Ably.Rest({ key: process.env.ABLY_API_KEY });
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
      canPost: user.role === 'student',
      members,
    };
  });
}

// GET /api/lms/chat
router.get('/', requireAuth, async (req, res) => {
  const enabled = !!process.env.ABLY_API_KEY;
  const rooms = await roomsFor(req.user);
  res.json({ enabled, me: String(req.user._id), rooms });
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

export default router;
