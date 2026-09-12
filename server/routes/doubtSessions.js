import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { DoubtSession } from '../models/DoubtSession.js';
import { DoubtBooking } from '../models/DoubtBooking.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { myBatchIds } from '../utils/access.js';
import { notifyMany } from '../utils/notify.js';

const router = Router();

const MAX_SLOTS = 24;
const slotEnd = (s, at) => new Date(new Date(at).getTime() + (s.slotMinutes || 30) * 60000);
const sessionEndsAt = (s) => (s.slotsAt?.length ? slotEnd(s, s.slotsAt[s.slotsAt.length - 1]) : null);

/** Every student in the invited cohorts, deduped — a student in two batches is
 *  one person and must not be notified twice. */
async function audienceOf(session) {
  const batches = await Batch.find({ _id: { $in: session.batchIds || [] } }).select('studentIds');
  const seen = new Map();
  for (const b of batches) for (const id of b.studentIds || []) if (!seen.has(String(id))) seen.set(String(id), id);
  return [...seen.values()];
}

/** The slot grid: every slot, whether it is gone, and which one is yours. */
function grid(session, bookings, viewerId) {
  const taken = new Map(bookings.map((b) => [new Date(b.slotAt).getTime(), b]));
  const now = Date.now();
  return (session.slotsAt || []).map((at) => {
    const t = new Date(at).getTime();
    const b = taken.get(t);
    return {
      at,
      endsAt: slotEnd(session, at),
      taken: !!b,
      mine: !!b && String(b.studentId) === String(viewerId),
      past: slotEnd(session, at).getTime() <= now,
    };
  });
}

const publicSession = (s, slots, mine) => ({
  _id: s._id,
  title: s.title,
  message: s.message,
  joinUrl: s.joinUrl,
  slotMinutes: s.slotMinutes,
  startsAt: s.slotsAt?.[0] || null,
  endsAt: sessionEndsAt(s),
  slots,
  booking: mine ? { slotAt: mine.slotAt, name: mine.name, doubts: mine.doubts } : null,
});

// ── Student ────────────────────────────────────────────────────────────────

// GET /api/lms/doubt-sessions/open — the nearest doubt session this student is
// invited to that has not finished, with the slot grid and their own booking.
// One session, not a list: the notification points here to do one thing.
router.get('/open', requireAuth, async (req, res) => {
  if (req.user.role !== 'student') return res.json({ session: null });
  const batchIds = await myBatchIds(req.user);
  if (!batchIds.length) return res.json({ session: null });

  const candidates = await DoubtSession.find({
    batchIds: { $in: batchIds },
    cancelledAt: null,
  }).sort({ createdAt: -1 }).limit(20);

  const live = candidates
    .filter((s) => sessionEndsAt(s) && sessionEndsAt(s).getTime() > Date.now())
    .sort((a, b) => new Date(a.slotsAt[0]) - new Date(b.slotsAt[0]))[0];
  if (!live) return res.json({ session: null });

  const bookings = await DoubtBooking.find({ sessionId: live._id });
  const mine = bookings.find((b) => String(b.studentId) === String(req.user._id));
  res.json({ session: publicSession(live, grid(live, bookings, req.user._id), mine) });
});

// POST /api/lms/doubt-sessions/:id/book { slotAt, name, doubts }
//
// Books, or moves an existing booking. The slot is claimed by writing it, not
// by checking it first: see the unique indexes on DoubtBooking. A clash comes
// back as 409 WITH the refreshed grid, so the student picks again from what is
// actually free rather than from what was free when the page loaded.
router.post('/:id/book', requireAuth, requireRole('student'), async (req, res) => {
  const session = await DoubtSession.findById(req.params.id);
  if (!session || session.cancelledAt) return res.status(404).json({ error: 'That doubt session is no longer open.' });

  const batchIds = (await myBatchIds(req.user)).map(String);
  if (!(session.batchIds || []).some((b) => batchIds.includes(String(b)))) {
    return res.status(403).json({ error: 'This doubt session is not for your batch.' });
  }

  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Your name is required.' });

  const wanted = new Date(req.body?.slotAt || '');
  if (Number.isNaN(wanted.getTime())) return res.status(400).json({ error: 'Pick a time slot.' });
  const slot = (session.slotsAt || []).find((at) => new Date(at).getTime() === wanted.getTime());
  if (!slot) return res.status(400).json({ error: 'That time slot is not part of this session.' });
  if (slotEnd(session, slot).getTime() <= Date.now()) return res.status(400).json({ error: 'That slot has already passed — pick a later one.' });

  const doc = {
    batchId: (session.batchIds || []).find((b) => batchIds.includes(String(b))) || null,
    name,
    slotAt: slot,
    doubts: String(req.body?.doubts || '').slice(0, 2000),
  };

  try {
    await DoubtBooking.updateOne(
      { sessionId: session._id, studentId: req.user._id },
      { $set: doc },
      { upsert: true },
    );
  } catch (err) {
    if (err?.code !== 11000) throw err;
    // The only uniqueness that can fail here is the slot: the student's own row
    // is the one being written. Someone else got there first.
    const bookings = await DoubtBooking.find({ sessionId: session._id });
    return res.status(409).json({
      error: 'Someone booked that slot a moment ago. Please pick another.',
      session: publicSession(session, grid(session, bookings, req.user._id), bookings.find((b) => String(b.studentId) === String(req.user._id))),
    });
  }

  const bookings = await DoubtBooking.find({ sessionId: session._id });
  const mine = bookings.find((b) => String(b.studentId) === String(req.user._id));
  res.json({ ok: true, session: publicSession(session, grid(session, bookings, req.user._id), mine) });
});

// DELETE /api/lms/doubt-sessions/:id/book — give the slot back. Better that a
// student who cannot make it frees 8:00 than that the mentor sits through it.
router.delete('/:id/book', requireAuth, requireRole('student'), async (req, res) => {
  const session = await DoubtSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found.' });
  await DoubtBooking.deleteOne({ sessionId: session._id, studentId: req.user._id });
  const bookings = await DoubtBooking.find({ sessionId: session._id });
  res.json({ ok: true, session: publicSession(session, grid(session, bookings, req.user._id), null) });
});

// ── Admin ──────────────────────────────────────────────────────────────────

// GET /api/lms/doubt-sessions — every session with who booked what, newest
// first, plus the batch list the create form picks its audience from.
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const q = {};
  if (req.query.programId) q.programId = req.query.programId;
  if (req.query.batchId) q.batchIds = req.query.batchId;

  const sessions = await DoubtSession.find(q).sort({ createdAt: -1 }).limit(100);
  const bookings = await DoubtBooking.find({ sessionId: { $in: sessions.map((s) => s._id) } }).sort({ slotAt: 1 });
  const students = await User.find({ _id: { $in: bookings.map((b) => b.studentId) } }).select('fullName email').lean();
  const S = Object.fromEntries(students.map((u) => [String(u._id), u]));
  const batches = await Batch.find().select('name programId studentIds').populate('programId', 'title').lean();
  const B = Object.fromEntries(batches.map((b) => [String(b._id), b]));

  res.json({
    batches: batches.map((b) => ({
      id: String(b._id),
      name: b.name,
      program: b.programId?.title || '',
      programId: b.programId?._id ? String(b.programId._id) : '',
      students: (b.studentIds || []).length,
    })),
    sessions: sessions.map((s) => {
      const rows = bookings.filter((b) => String(b.sessionId) === String(s._id));
      const byTime = new Map(rows.map((b) => [new Date(b.slotAt).getTime(), b]));
      return {
        _id: s._id,
        title: s.title,
        message: s.message,
        joinUrl: s.joinUrl,
        slotMinutes: s.slotMinutes,
        startsAt: s.slotsAt?.[0] || null,
        endsAt: sessionEndsAt(s),
        cancelledAt: s.cancelledAt,
        notifiedAt: s.notifiedAt,
        notifiedCount: s.notifiedCount,
        pushes: s.pushes,
        batches: (s.batchIds || []).map((id) => B[String(id)]?.name || 'Removed batch'),
        invited: (s.batchIds || []).reduce((n, id) => n + (B[String(id)]?.studentIds?.length || 0), 0),
        booked: rows.length,
        // Every slot, free ones included — the gaps are what an admin looks at.
        slots: (s.slotsAt || []).map((at) => {
          const b = byTime.get(new Date(at).getTime());
          return {
            at,
            booking: b
              ? {
                _id: b._id,
                name: b.name,
                doubts: b.doubts,
                student: { name: S[String(b.studentId)]?.fullName || '', email: S[String(b.studentId)]?.email || '' },
                bookedAt: b.createdAt,
              }
              : null,
          };
        }),
      };
    }),
  });
});

// POST /api/lms/doubt-sessions { programId, batchIds, slotsAt[], slotMinutes,
//                               title, message, joinUrl, notify }
//
// The client sends the resolved slot instants: "Wednesday, 7 to 10" is a fact
// about the admin's calendar and clock, and the server's is UTC.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { programId, batchIds, slotsAt, slotMinutes, title, message, joinUrl, notify } = req.body || {};
  if (!programId) return res.status(400).json({ error: 'Pick a programme.' });
  if (!Array.isArray(batchIds) || !batchIds.length) return res.status(400).json({ error: 'Pick at least one batch.' });

  // Dedupe and sort so the grid renders in time order whatever arrives.
  const times = [...new Set((Array.isArray(slotsAt) ? slotsAt : []).map((x) => new Date(x).getTime()).filter((n) => !Number.isNaN(n)))].sort((a, b) => a - b);
  if (!times.length) return res.status(400).json({ error: 'Pick a date and a time window.' });
  if (times.length > MAX_SLOTS) return res.status(400).json({ error: `That is more than ${MAX_SLOTS} slots.` });

  const session = await DoubtSession.create({
    programId,
    batchIds,
    title: String(title || 'Doubt session').slice(0, 200),
    message: String(message || '').slice(0, 2000),
    joinUrl: String(joinUrl || '').trim(),
    slotsAt: times.map((t) => new Date(t)),
    slotMinutes: Math.min(120, Math.max(5, Number(slotMinutes) || 30)),
    createdBy: req.user._id,
  });

  const pushed = notify === false ? 0 : await push(session);
  res.status(201).json({ ok: true, id: session._id, notified: pushed });
});

/** Send the in-app notification to everyone invited, and record the push. */
async function push(session) {
  const students = await audienceOf(session);
  const when = session.slotsAt?.[0]
    ? new Date(session.slotsAt[0]).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    : '';
  await notifyMany(students, {
    type: 'doubt',
    text: `🗓 ${session.title}${when ? ` — ${when}` : ''}. Book your slot and tell us your doubts.`,
    link: '/app/doubt-session',
  });
  await DoubtSession.updateOne(
    { _id: session._id },
    { $set: { notifiedAt: new Date(), notifiedCount: students.length }, $inc: { pushes: 1 } },
  );
  return students.length;
}

// POST /api/lms/doubt-sessions/:id/notify — push again. Deliberately separate
// from create: the admin sends a reminder when they decide to, which is what
// "I will only push the notification every time I need" asks for.
router.post('/:id/notify', requireAuth, requireRole('admin'), async (req, res) => {
  const session = await DoubtSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found.' });
  if (session.cancelledAt) return res.status(400).json({ error: 'That session is cancelled.' });
  res.json({ ok: true, notified: await push(session) });
});

// PATCH /api/lms/doubt-sessions/:id — the write-up or the link, after the fact.
// The slots are not editable: they are what people have already booked against.
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const set = {};
  for (const k of ['title', 'message', 'joinUrl']) if (req.body?.[k] !== undefined) set[k] = String(req.body[k]).slice(0, 2000);
  const session = await DoubtSession.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
  if (!session) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

// DELETE /api/lms/doubt-sessions/:id — cancel, keeping the bookings as a record
// of who had asked for what. It drops out of the students' view either way.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const session = await DoubtSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found.' });
  if (req.query.purge === '1') {
    await DoubtBooking.deleteMany({ sessionId: session._id });
    await session.deleteOne();
    return res.json({ ok: true, deleted: true });
  }
  await DoubtSession.updateOne({ _id: session._id }, { $set: { cancelledAt: new Date() } });
  res.json({ ok: true, cancelled: true });
});

export default router;
