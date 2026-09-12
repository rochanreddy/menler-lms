import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { myBatchIds } from '../utils/access.js';
import { notifyMany } from '../utils/notify.js';
import { rateLimit } from '../utils/rateLimit.js';

const router = Router();

export const CATEGORIES = ['access', 'classes', 'content', 'payments', 'other'];
const CATEGORY_LABEL = {
  access: 'Login & access',
  classes: 'Live classes & recordings',
  content: 'Lessons, assignments & grades',
  payments: 'Fees & payments',
  other: 'Something else',
};

// Ten new tickets an hour. Not a security control — support is the one place a
// person in trouble is *meant* to be able to shout, and a limit that silences
// them defeats the feature — but a stuck submit button fires forty in a second
// and turns the admin's queue into a wall. Set well above any honest use and
// well below a jammed button.
const NEW_TICKETS_PER_HOUR = 10;

/** Who spoke last decides the state, so the queue can never lie. */
const statusFromLast = (ticket) => (ticket.messages[ticket.messages.length - 1]?.authorRole === 'admin' ? 'answered' : 'open');

const shape = (t, people = new Map()) => ({
  _id: t._id,
  subject: t.subject,
  category: t.category,
  categoryLabel: CATEGORY_LABEL[t.category] || CATEGORY_LABEL.other,
  status: t.status,
  createdAt: t.createdAt,
  lastMessageAt: t.lastMessageAt,
  resolvedAt: t.resolvedAt,
  student: {
    id: t.studentId?._id || t.studentId,
    name: t.studentId?.fullName || '',
    email: t.studentId?.email || '',
  },
  batch: t.batchId ? { id: t.batchId._id || t.batchId, name: t.batchId.name || '' } : null,
  messages: (t.messages || []).map((m) => ({
    _id: m._id,
    text: m.text,
    authorRole: m.authorRole,
    // A reply signed "Menler team" rather than by a person is a support desk
    // hiding behind itself; the student wrote to someone, and someone answered.
    authorName: people.get(String(m.authorId)) || (m.authorRole === 'admin' ? 'Menler team' : ''),
    createdAt: m.createdAt,
  })),
});

/** Names for every author across these tickets, in one query. */
async function peopleIn(tickets) {
  const ids = new Set();
  for (const t of tickets) for (const m of t.messages || []) ids.add(String(m.authorId));
  if (!ids.size) return new Map();
  const users = await User.find({ _id: { $in: [...ids] } }).select('fullName email');
  return new Map(users.map((u) => [String(u._id), u.fullName || u.email]));
}

const adminIds = async () => (await User.find({ role: 'admin' }).select('_id')).map((u) => u._id);

// ── Student ────────────────────────────────────────────────────────────────

/** GET /api/lms/support/meta — the categories, so the form and the admin's
 *  filter read from the same list rather than two copies that drift. */
router.get('/meta', requireAuth, (_req, res) => {
  res.json({ categories: CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] })) });
});

/** GET /api/lms/support/mine — this student's tickets, newest activity first. */
router.get('/mine', requireAuth, requireRole('student'), async (req, res) => {
  const tickets = await SupportTicket.find({ studentId: req.user._id })
    .populate('batchId', 'name')
    .sort({ lastMessageAt: -1 })
    .limit(50);
  const people = await peopleIn(tickets);
  res.json({ tickets: tickets.map((t) => shape(t, people)) });
});

/** POST /api/lms/support { subject, category, message } — raise one. */
router.post('/', requireAuth, requireRole('student'), async (req, res) => {
  const subject = String(req.body?.subject || '').trim().slice(0, 160);
  const message = String(req.body?.message || '').trim().slice(0, 4000);
  if (!subject) return res.status(400).json({ error: 'Give your problem a short title.' });
  if (!message) return res.status(400).json({ error: 'Describe what went wrong.' });
  const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'other';

  if (!(await rateLimit(`support:new:${req.user._id}`, NEW_TICKETS_PER_HOUR, 60 * 60 * 1000))) {
    return res.status(429).json({ error: 'That is a lot of tickets in an hour — reply on the one you already opened and we will pick it up there.' });
  }

  const [batchId] = await myBatchIds(req.user);
  const now = new Date();
  const ticket = await SupportTicket.create({
    studentId: req.user._id,
    batchId: batchId || null,
    category,
    subject,
    status: 'open',
    messages: [{ authorId: req.user._id, authorRole: 'student', text: message }],
    lastMessageAt: now,
  });

  const who = req.user.fullName || req.user.email;
  await notifyMany(await adminIds(), {
    type: 'support',
    text: `${who} needs help: ${subject}`,
    link: '/app/support',
  });

  await ticket.populate('batchId', 'name');
  res.status(201).json({ ticket: shape(ticket, new Map([[String(req.user._id), who]])) });
});

// ── Admin ──────────────────────────────────────────────────────────────────

/** GET /api/lms/support?status=&batchId=&q= — the admin's queue.
 *
 *  Defaults to everything, not to open: a ticket answered yesterday and never
 *  replied to is the one most likely to have been dropped, and a queue that
 *  hides it is how it stays dropped. */
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const query = {};
  if (['open', 'answered', 'resolved'].includes(req.query.status)) query.status = req.query.status;
  if (req.query.batchId) query.batchId = req.query.batchId;

  const q = String(req.query.q || '').trim();
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matches = await User.find({ $or: [{ fullName: rx }, { email: rx }] }).select('_id');
    query.$or = [{ subject: rx }, { 'messages.text': rx }, { studentId: { $in: matches.map((u) => u._id) } }];
  }

  const tickets = await SupportTicket.find(query)
    .populate('studentId', 'fullName email')
    .populate('batchId', 'name')
    .sort({ lastMessageAt: -1 })
    .limit(200);
  const people = await peopleIn(tickets);

  // Counts are of the whole desk, not of the filtered page — they are what the
  // filter chips are labelled with, so they must not move when you use one.
  const counts = { open: 0, answered: 0, resolved: 0 };
  for (const row of await SupportTicket.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])) {
    if (row._id in counts) counts[row._id] = row.n;
  }

  const batches = await Batch.find().select('name').sort({ name: 1 });
  res.json({
    tickets: tickets.map((t) => shape(t, people)),
    counts,
    batches: batches.map((b) => ({ id: b._id, name: b.name })),
  });
});

// ── Both sides ─────────────────────────────────────────────────────────────

/** POST /api/lms/support/:id/reply { text } — the admin answers, or the
 *  student adds to their own ticket. A student reply reopens a resolved
 *  ticket: "that didn't work" must not fall into a closed folder. */
router.post('/:id/reply', requireAuth, requireRole('student', 'admin'), async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: 'Write a reply first.' });

  const ticket = await SupportTicket.findById(req.params.id).populate('batchId', 'name');
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  const isOwner = String(ticket.studentId) === String(req.user._id);
  if (req.user.role !== 'admin' && !isOwner) return res.status(403).json({ error: 'Forbidden.' });

  ticket.messages.push({ authorId: req.user._id, authorRole: req.user.role, text });
  ticket.lastMessageAt = new Date();
  ticket.status = statusFromLast(ticket);
  ticket.resolvedAt = null;
  ticket.resolvedBy = null;
  await ticket.save();

  if (req.user.role === 'admin') {
    await notifyMany([ticket.studentId], {
      type: 'support',
      text: `Support replied about “${ticket.subject}”`,
      link: '/app/support',
    });
  } else {
    await notifyMany(await adminIds(), {
      type: 'support',
      text: `${req.user.fullName || req.user.email} replied on “${ticket.subject}”`,
      link: '/app/support',
    });
  }

  const people = await peopleIn([ticket]);
  if (req.user.role === 'admin') await ticket.populate('studentId', 'fullName email');
  res.json({ ticket: shape(ticket, people) });
});

/** PATCH /api/lms/support/:id { status } — close it, or put it back. */
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const wanted = req.body?.status;
  if (!['open', 'resolved'].includes(wanted)) return res.status(400).json({ error: 'Unknown status.' });

  const ticket = await SupportTicket.findById(req.params.id)
    .populate('studentId', 'fullName email')
    .populate('batchId', 'name');
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  if (wanted === 'resolved') {
    ticket.status = 'resolved';
    ticket.resolvedAt = new Date();
    ticket.resolvedBy = req.user._id;
    // The student is told, because a ticket that goes quiet and a ticket that
    // was settled look identical from their side.
    await notifyMany([ticket.studentId?._id || ticket.studentId], {
      type: 'support',
      text: `Your support ticket “${ticket.subject}” was marked resolved`,
      link: '/app/support',
    });
  } else {
    ticket.status = statusFromLast(ticket);
    ticket.resolvedAt = null;
    ticket.resolvedBy = null;
  }
  await ticket.save();

  res.json({ ticket: shape(ticket, await peopleIn([ticket])) });
});

export default router;
