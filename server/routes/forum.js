import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Message } from '../models/Message.js';
import { Doubt } from '../models/Doubt.js';
import { User } from '../models/User.js';
import { canAccessBatch } from '../utils/access.js';
import { notify } from '../utils/notify.js';

const router = Router();

const author = (u) => (u ? { id: u._id, name: u.fullName || u.email, role: u.role } : null);

// ── Group chat ──

// GET /api/lms/forum/chat?batchId=.. — last 200 messages (members only).
router.get('/chat', requireAuth, async (req, res) => {
  const { batchId } = req.query;
  if (!batchId || !(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  // Newest 200, not oldest — sort descending to take the right slice, then
  // reverse back to chronological order for display.
  const rows = await Message.find({ batchId }).populate('authorId', 'fullName email role').sort({ createdAt: -1 }).limit(200);
  res.json({ messages: rows.reverse().map((m) => ({ id: m._id, text: m.text, at: m.createdAt, author: author(m.authorId) })) });
});

// POST /api/lms/forum/chat { batchId, text }
router.post('/chat', requireAuth, async (req, res) => {
  const { batchId, text } = req.body || {};
  if (!batchId || !text?.trim()) return res.status(400).json({ error: 'batchId and text are required.' });
  if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const m = await (await Message.create({ batchId, authorId: req.user._id, text: text.trim() })).populate('authorId', 'fullName email role');
  res.status(201).json({ message: { id: m._id, text: m.text, at: m.createdAt, author: author(m.authorId) } });
});

// ── Boards ──
//
// Two boards, one collection: `kind` is 'doubt' (a question) or 'share'
// (something worth passing on). Everything else — likes, comments, batch
// access — is identical, so it is one set of routes with a filter, not two.

// A board query always names its kind. Rows written before the share board
// existed have no `kind` field, and a missing field is what `null` matches in
// Mongo — which is why the doubts filter is an $in and not an equality.
const kindOf = (v) => (v === 'share' ? 'share' : 'doubt');
const kindFilter = (kind) => (kind === 'share' ? 'share' : { $in: ['doubt', null] });

// Reads a lean object as happily as a hydrated document: `likes`/`comments`
// are guarded because a plain object from .lean() carries no schema defaults.
const shapeDoubt = (d, meId, people) => ({
  id: d._id,
  text: d.text,
  at: d.createdAt,
  author: author(people.get(String(d.authorId))),
  likeCount: (d.likes || []).length,
  likedByMe: (d.likes || []).some((x) => x.toString() === meId),
  comments: (d.comments || []).map((c) => ({
    id: c._id, text: c.text, at: c.createdAt, author: author(people.get(String(c.authorId))),
  })),
});

// GET /api/lms/forum/doubts?batchId=..&kind=doubt|share
// The board polls this every few seconds from every open tab, so it is the most
// frequently served query in the app AND the one whose cost grows on its own as
// a batch accumulates doubts. Hence the two things it did not used to have:
//   .limit()  so an old batch can't grow this response without bound (200 to
//             match the chat above; a batch past that needs real pagination)
//   .lean()   because nothing here mutates -- building full Mongoose documents
//             for hundreds of doubts, authors and comments was pure waste
router.get('/doubts', requireAuth, async (req, res) => {
  const { batchId } = req.query;
  if (!batchId || !(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const rows = await Doubt.find({ batchId, kind: kindFilter(kindOf(req.query.kind)) }).sort({ createdAt: -1 }).limit(200).lean();

  // Resolve every author in ONE query rather than two populates. Mongoose issues
  // each populate as its own round trip, so the board used to cost three trips
  // per poll; now it costs two. Polled every few seconds from every open tab,
  // these are the most-repeated database operations in the app.
  const ids = new Set();
  for (const d of rows) {
    if (d.authorId) ids.add(String(d.authorId));
    for (const c of d.comments || []) if (c.authorId) ids.add(String(c.authorId));
  }
  const people = new Map();
  if (ids.size) {
    const found = await User.find({ _id: { $in: [...ids] } }).select('fullName email role').lean();
    for (const u of found) people.set(String(u._id), u);
  }

  res.json({ doubts: rows.map((d) => shapeDoubt(d, req.user._id.toString(), people)) });
});

// POST /api/lms/forum/doubts { batchId, text, kind? }
// Only students ask doubts — a mentor with a question is not what this board is
// for. A share is open to mentors as well: a mentor passing on a good article is
// the same act as a student doing it, and the board is poorer without them.
router.post('/doubts', requireAuth, async (req, res) => {
  const { batchId, text } = req.body || {};
  const kind = kindOf(req.body?.kind);
  if (kind === 'doubt' && req.user.role !== 'student') return res.status(403).json({ error: 'Only students can post doubts. Mentors answer them.' });
  if (!batchId || !text?.trim()) return res.status(400).json({ error: 'batchId and text are required.' });
  if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
  await Doubt.create({ batchId, kind, authorId: req.user._id, text: text.trim() });
  res.status(201).json({ ok: true });
});

// POST /api/lms/forum/doubts/:id/like — toggle like.
router.post('/doubts/:id/like', requireAuth, async (req, res) => {
  const d = await Doubt.findById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Doubt not found.' });
  if (!(await canAccessBatch(req.user, d.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  const me = req.user._id.toString();
  const liked = d.likes.some((x) => x.toString() === me);
  d.likes = liked ? d.likes.filter((x) => x.toString() !== me) : [...d.likes, req.user._id];
  await d.save();
  res.json({ likeCount: d.likes.length, likedByMe: !liked });
});

// POST /api/lms/forum/doubts/:id/comments { text }
router.post('/doubts/:id/comments', requireAuth, async (req, res) => {
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'text is required.' });
  const d = await Doubt.findById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Doubt not found.' });
  if (!(await canAccessBatch(req.user, d.batchId))) return res.status(403).json({ error: 'Forbidden.' });
  d.comments.push({ authorId: req.user._id, text: text.trim() });
  await d.save();
  // Notify the post's author (unless they're replying to themselves). The link
  // carries the tab, or answering a share drops the reader on the doubts board.
  if (d.authorId.toString() !== req.user._id.toString()) {
    const who = req.user.fullName || 'Someone';
    notify(d.authorId, d.kind === 'share'
      ? { type: 'doubt', text: `${who} replied to what you shared.`, link: '/app/forum?tab=shares' }
      : { type: 'doubt', text: `${who} answered your doubt.`, link: '/app/forum' });
  }
  res.status(201).json({ ok: true });
});

export default router;
