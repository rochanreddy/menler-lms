import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { DoubtSession } from '../models/DoubtSession.js';
import { DoubtBooking } from '../models/DoubtBooking.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { myBatchIds } from '../utils/access.js';
import { notify, notifyMany } from '../utils/notify.js';
import {
  ATTACHMENT_REFUSAL, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES,
  dropAttachments, sniffAttachment, storeDoubtAttachment,
} from '../utils/doubtAttachments.js';

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

const publicAttachment = (a) => ({ _id: a._id, url: a.url, name: a.name, mimeType: a.mimeType, size: a.size });

const publicSession = (s, slots, mine) => ({
  _id: s._id,
  title: s.title,
  message: s.message,
  joinUrl: s.joinUrl,
  slotMinutes: s.slotMinutes,
  startsAt: s.slotsAt?.[0] || null,
  endsAt: sessionEndsAt(s),
  // Booking is shut but the evening is still on: the grid is read-only from
  // here, and everyone who already booked keeps their slot and their link.
  bookingsClosed: !!s.bookingsClosedAt,
  slots,
  // `joinUrl` on the booking is this student's own room; the session's is the
  // fallback for a session that runs on one shared link.
  booking: mine
    ? {
      slotAt: mine.slotAt,
      name: mine.name,
      doubts: mine.doubts,
      joinUrl: mine.joinUrl || '',
      attachments: (mine.attachments || []).map(publicAttachment),
    }
    : null,
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

  // Closed means closed for NEW claims and for moves — the mentor has built
  // the evening from the sheet as it stands, and a slot changing hands after
  // that is the thing closing it is for. Giving a slot back is still allowed
  // (see the DELETE below).
  if (session.bookingsClosedAt) {
    const bookings = await DoubtBooking.find({ sessionId: session._id });
    const mine = bookings.find((b) => String(b.studentId) === String(req.user._id));
    return res.status(409).json({
      error: mine
        ? 'Booking has closed for this session — your slot is still yours.'
        : 'Booking has closed for this session. Post your question on the Forum and a mentor will pick it up there.',
      session: publicSession(session, grid(session, bookings, req.user._id), mine),
    });
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
// student who cannot make it frees 8:00 than that the mentor sits through it,
// which is why this one outlives the close: a freed slot is information the
// mentor can act on, and holding someone to a slot they cannot attend only
// buys an empty chair nobody was warned about. They cannot take it back,
// though — the page says so before they press it.
router.delete('/:id/book', requireAuth, requireRole('student'), async (req, res) => {
  const session = await DoubtSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found.' });
  // The booking is what the files belonged to, so they go with it rather than
  // waiting for the sweep: there is no longer a slot for anyone to read them at.
  const mine = await DoubtBooking.findOne({ sessionId: session._id, studentId: req.user._id }).select('attachments');
  if (mine) await dropAttachments(mine.attachments);
  await DoubtBooking.deleteOne({ sessionId: session._id, studentId: req.user._id });
  const bookings = await DoubtBooking.find({ sessionId: session._id });
  res.json({ ok: true, session: publicSession(session, grid(session, bookings, req.user._id), null) });
});

// ── Attachments on a booking ───────────────────────────────────────
//
// "I can't get this to run" is a sentence; the screenshot of the stack trace is
// the thing the mentor actually needs, and before this there was nowhere to put
// it but a chat nobody reads until the call has already started.
//
// They belong to the booking, not to the student and not to the session: one
// slot, one set of files, and when the slot goes the files go. The sweep in
// utils/doubtAttachmentSweep.js ends the rest of them once the evening is over,
// which is the promise the upload box makes on screen.

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS },
});

// POST /api/lms/doubt-sessions/:id/attachments — multipart, files[].
//
// A booking is the prerequisite, not the session: attaching a screenshot to an
// evening you have not booked has nobody to show it to. Booking being CLOSED is
// deliberately not a refusal — the close freezes who holds which slot, and a
// student adding the screenshot their mentor just asked for is neither a new
// claim nor a move.
router.post('/:id/attachments', requireAuth, requireRole('student'), (req, res) => {
  attachmentUpload.array('files', MAX_ATTACHMENTS)(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is over the 5 MB limit.' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: `Attach up to ${MAX_ATTACHMENTS} files.` });
      return res.status(400).json({ error: 'Upload failed.' });
    }

    const session = await DoubtSession.findById(req.params.id);
    if (!session || session.cancelledAt) return res.status(404).json({ error: 'That doubt session is no longer open.' });
    // Past its last slot the files would be swept within the hour anyway, so
    // taking them is worse than saying no: it would look like it had worked.
    const ends = sessionEndsAt(session);
    if (ends && ends.getTime() <= Date.now()) return res.status(409).json({ error: 'That session is over.' });

    const booking = await DoubtBooking.findOne({ sessionId: session._id, studentId: req.user._id });
    if (!booking) return res.status(409).json({ error: 'Book a slot first, then attach what you want your mentor to look at.' });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No file chosen.' });
    const room = MAX_ATTACHMENTS - (booking.attachments || []).length;
    if (files.length > room) {
      return res.status(413).json({
        error: room > 0
          ? `You can attach ${room} more file${room === 1 ? '' : 's'}.`
          : `You already have ${MAX_ATTACHMENTS} files attached. Remove one first.`,
      });
    }

    // Sniffed, not trusted: the type a browser reports is the type the OS told
    // it, and this is the value the file is later served back with.
    const sniffed = files.map((f) => [f, sniffAttachment(f)]);
    const bad = sniffed.find(([, mime]) => !mime);
    if (bad) return res.status(415).json({ error: `${bad[0].originalname || 'That file'} is not something we can show your mentor. ${ATTACHMENT_REFUSAL}` });

    try {
      for (const [file, mime] of sniffed) {
        booking.attachments.push(await storeDoubtAttachment(file, req.user._id, mime));
      }
      await booking.save();
    } catch {
      return res.status(500).json({ error: 'Could not store the file.' });
    }

    res.status(201).json({ ok: true, attachments: booking.attachments.map(publicAttachment) });
  });
});

// DELETE /api/lms/doubt-sessions/:id/attachments/:aid — take one off, and take
// the bytes with it. Nothing here is kept as a record: the whole point of the
// feature is that it does not outlast the evening.
router.delete('/:id/attachments/:aid', requireAuth, requireRole('student'), async (req, res) => {
  const booking = await DoubtBooking.findOne({ sessionId: req.params.id, studentId: req.user._id });
  if (!booking) return res.status(404).json({ error: 'Not found.' });
  const one = booking.attachments.id(req.params.aid);
  if (!one) return res.status(404).json({ error: 'That file is already gone.' });
  await dropAttachments([one]);
  booking.attachments.pull(req.params.aid);
  await booking.save();
  res.json({ ok: true, attachments: booking.attachments.map(publicAttachment) });
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
        bookingsClosedAt: s.bookingsClosedAt,
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
                attachments: (b.attachments || []).map(publicAttachment),
                joinUrl: b.joinUrl || '',
                joinSharedAt: b.joinSharedAt,
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
    // No emoji in the text: the bell draws its own icon, and a glyph the
    // reader's machine lacks renders as a tofu box.
    text: `${session.title}${when ? ` — ${when}` : ''}. Book your slot and tell us your doubts.`,
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

// PATCH /api/lms/doubt-sessions/:id/bookings/:bookingId { joinUrl, notify }
//
// The meeting link for ONE student's slot. A doubt slot is one person in the
// room, so the room is made after the booking exists — which is why this is
// not the create form's `joinUrl`: that one is announced to everybody, and a
// Meet handed to a whole cohort is a Meet with the whole cohort in it.
//
// Saving it tells that student and nobody else. Sending is deliberate and
// repeatable, like pushing the announcement: pass `notify: false` to correct a
// typo quietly, and press it again to remind them. Clearing the field takes
// the link down without sending anything.
router.patch('/:id/bookings/:bookingId', requireAuth, requireRole('admin'), async (req, res) => {
  const session = await DoubtSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found.' });

  const booking = await DoubtBooking.findOne({ _id: req.params.bookingId, sessionId: session._id });
  if (!booking) return res.status(404).json({ error: 'That booking is no longer there.' });

  const joinUrl = String(req.body?.joinUrl || '').trim().slice(0, 500);
  // A link that is not a link is the one failure the student cannot work
  // around, and they meet it at the minute the slot starts.
  if (joinUrl && !/^https?:\/\//i.test(joinUrl)) {
    return res.status(400).json({ error: 'The meeting link must start with http:// or https://' });
  }

  const shared = !!joinUrl && req.body?.notify !== false;
  await DoubtBooking.updateOne(
    { _id: booking._id },
    { $set: { joinUrl, joinSharedAt: shared ? new Date() : (joinUrl ? booking.joinSharedAt : null) } },
  );

  if (shared) {
    const when = new Date(booking.slotAt).toLocaleTimeString('en-IN', {
      hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
    });
    await notify(booking.studentId, {
      type: 'doubt',
      text: `Your ${session.title.toLowerCase()} slot at ${when} has a meeting link. Open it from the doubt session page.`,
      link: '/app/doubt-session',
    });
  }

  res.json({ ok: true, shared });
});

// PATCH /api/lms/doubt-sessions/:id { title, message, joinUrl, bookingsClosed }
//
// The write-up or the link, after the fact. The slots are not editable: they
// are what people have already booked against.
//
// `bookingsClosed` shuts the sheet without touching the evening — the admin
// presses it once the bookings are the ones they are going to make the Meets
// for. It is a flag rather than an emptying of `slotsAt`, because a closed
// session must still show every booked student their slot and their link, and
// because "actually, squeeze one more in" is answered by setting it back to
// false rather than by rebuilding the grid.
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const set = {};
  for (const k of ['title', 'message', 'joinUrl']) if (req.body?.[k] !== undefined) set[k] = String(req.body[k]).slice(0, 2000);
  if (req.body?.bookingsClosed !== undefined) set.bookingsClosedAt = req.body.bookingsClosed ? new Date() : null;
  const session = await DoubtSession.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
  if (!session) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true, bookingsClosed: !!session.bookingsClosedAt });
});

// DELETE /api/lms/doubt-sessions/:id — cancel, keeping the bookings as a record
// of who had asked for what. It drops out of the students' view either way.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const session = await DoubtSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Not found.' });
  // Either way the attachments go NOW rather than at the sweep. Cancelling
  // pulls the evening from every student's view, and a screenshot nobody can
  // reach any more is one nobody agreed to keep storing.
  const rows = await DoubtBooking.find({ sessionId: session._id }).select('attachments');
  for (const r of rows) await dropAttachments(r.attachments);

  if (req.query.purge === '1') {
    await DoubtBooking.deleteMany({ sessionId: session._id });
    await session.deleteOne();
    return res.json({ ok: true, deleted: true });
  }
  await DoubtBooking.updateMany({ sessionId: session._id }, { $set: { attachments: [] } });
  await DoubtSession.updateOne({ _id: session._id }, { $set: { cancelledAt: new Date() } });
  res.json({ ok: true, cancelled: true });
});

export default router;
