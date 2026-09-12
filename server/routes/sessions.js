import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { Attendance } from '../models/Attendance.js';
import { canAccessBatch, myBatchIds } from '../utils/access.js';
import { EARLY_MS, isWithinWindow, joinWindow, normMeetingId } from '../utils/sessionTime.js';

const router = Router();

// Pull a Zoom meeting id out of a join URL (…/j/8451234567?…). Registration
// links don't contain it, so the mentor can also enter it manually.
function extractMeetingId(url) {
  const s = String(url || '');
  const m = s.match(/\/j\/(\d{9,12})/) || s.match(/(\d{9,12})/);
  return m ? m[1] : '';
}

const meetingIdFrom = (zoomMeetingId, joinUrl) => normMeetingId(zoomMeetingId) || extractMeetingId(joinUrl);

// The live classes a programme is built from, in order, for titling a
// bulk-scheduled cohort. The two curricula are shaped differently: a
// Kickstarter module IS a session ("S01 · AI Foundations…"), while a
// Generalist module is a week whose "S1 · Week 1: …" chapters are its two
// sessions (its other chapters are the week's assignment and project).
//
// `weeks` is one title per module, for cohorts that teach a whole module in
// one sitting — the Generalist runs both of a week's sessions in a single
// four-hour Sunday class, so it schedules six classes, not twelve.
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
function sessionOutline(program) {
  const titles = [];
  const weeks = [];
  for (const m of [...(program?.modules || [])].sort(byOrder)) {
    const sessions = [...(m.chapters || [])].filter((c) => /^S\d+\s*·/.test(c.title || '')).sort(byOrder);
    if (sessions.length) sessions.forEach((c) => titles.push(c.title));
    else titles.push(m.title);
    weeks.push(m.title);
  }
  return { titles, weeks };
}

// GET /api/lms/sessions?batchId=..  OR  ?scope=upcoming|past
// - batchId: sessions for one batch (members only)
// - otherwise: sessions across all the user's batches (for Home/calendar)
router.get('/', requireAuth, async (req, res) => {
  const { batchId, scope } = req.query;
  let filter;
  if (batchId) {
    if (!(await canAccessBatch(req.user, batchId))) return res.status(403).json({ error: 'Forbidden.' });
    filter = { batchId };
  } else {
    filter = { batchId: { $in: await myBatchIds(req.user) } };
  }
  const now = new Date();
  if (scope === 'upcoming') filter.startsAt = { $gte: now };
  if (scope === 'past') filter.startsAt = { $lt: now };

  const sessions = await Session.find(filter)
    .populate('batchId', 'name')
    .sort({ startsAt: scope === 'past' ? -1 : 1 });
  res.json({ sessions });
});

// GET /api/lms/sessions/live?dayStart=&dayEnd= — the one session the Home
// "Join Live Class" CTA cares about: today's class if there is one, else the
// most recent past one. dayStart/dayEnd are ISO instants for the CALLER's
// local midnight-to-midnight window — "today" has to mean the student's own
// calendar day, not the server's, so the client computes and sends it rather
// than the server guessing a timezone. Falls back to the server's own UTC day
// only if they're missing/invalid (defensive — every real caller sends them).
router.get('/live', requireAuth, async (req, res) => {
  const batchIds = await myBatchIds(req.user);
  const now = Date.now();
  const mine = { batchId: { $in: batchIds } };

  // "Live" is a WINDOW around the class, not a calendar day. It used to mean
  // "starts today", which put a green Join button on Home from midnight and
  // left it there until midnight again — so students joined an empty room
  // hours early, and the one signal that should mean "your class is starting"
  // meant nothing. Now it opens five minutes before and closes five minutes
  // after the end (see utils/sessionTime.js).
  //
  // dayStart/dayEnd are still accepted from older clients and ignored: a
  // window is an instant-to-instant fact, so it needs no timezone hint.
  const near = await Session.find({
    ...mine,
    startsAt: { $gte: new Date(now - 24 * 60 * 60 * 1000), $lte: new Date(now + EARLY_MS) },
  }).populate('batchId', 'name').sort({ startsAt: 1 });
  const live = near.find((s) => isWithinWindow(s, now));

  // Nothing on now → the next class (so a cohort scheduled ahead of time sees
  // it coming), and only when there is nothing left, the last one for its
  // recording.
  const next = live ? null : await Session.findOne({ ...mine, startsAt: { $gt: new Date(now) } }).populate('batchId', 'name').sort({ startsAt: 1 });
  const session = live || next || await Session.findOne({ ...mine, startsAt: { $lte: new Date(now) } }).populate('batchId', 'name').sort({ startsAt: -1 });

  if (!session) return res.json({ session: null, today: false, upcoming: false, url: '' });

  const w = joinWindow(session);
  res.json({
    session: { _id: session._id, title: session.title, startsAt: session.startsAt, endsAt: session.endsAt, batchId: session.batchId },
    today: !!live,
    upcoming: !!next,
    // Live → the Zoom link. A future class → no link yet: the Join button
    // appears when the window opens, so an early click can't open an empty
    // room and leave the student wondering why they weren't marked present. A
    // past class → its recording only; with a recurring meeting its Zoom link
    // is just the room the next class will use.
    url: live ? session.joinUrl || '' : next ? '' : session.recordingUrl || '',
    // When this answer stops being true. The client flips at the boundary on
    // its own rather than showing a stale green bar until someone reloads.
    opensAt: new Date(w.opens),
    closesAt: new Date(w.closes),
    updatedAt: session.updatedAt,
  });
});

// GET /api/lms/sessions/outline?batchId= — admin: the session titles of the
// batch's programme, in order, to prefill the bulk scheduler.
router.get('/outline', requireAuth, requireRole('admin'), async (req, res) => {
  const batch = await Batch.findById(req.query.batchId).populate('programId', 'title modules');
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });
  res.json({ program: batch.programId?.title || '', ...sessionOutline(batch.programId) });
});

// POST /api/lms/sessions — admin schedules a class (only admins create Zoom sessions).
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { batchId, title, startsAt, endsAt, joinUrl, zoomMeetingId } = req.body || {};
  if (!batchId || !title || !startsAt) return res.status(400).json({ error: 'batchId, title and startsAt are required.' });
  const session = await Session.create({ batchId, title, startsAt, endsAt: endsAt || null, joinUrl: joinUrl || '', zoomMeetingId: meetingIdFrom(zoomMeetingId, joinUrl) });
  res.status(201).json({ session });
});

// POST /api/lms/sessions/bulk — admin schedules a whole cohort in one go.
//   { batchId, joinUrl, zoomMeetingId, sessions: [{ title, startsAt, endsAt, joinUrl?, zoomMeetingId? }] }
// The client works out the dates, because only it knows the admin's timezone:
// "every Saturday at 7 pm" is an IST fact, and the server runs in UTC.
// Each class usually has its own Zoom meeting, so a row's own link wins; the
// top-level link is the fallback for a course run on one recurring meeting
// (which the Zoom webhook tells apart by time). A row may also have no link
// yet — Zoom links are often made week by week and added with Edit later.
router.post('/bulk', requireAuth, requireRole('admin'), async (req, res) => {
  const { batchId, joinUrl = '', zoomMeetingId = '', sessions } = req.body || {};
  if (!batchId || !(await Batch.exists({ _id: batchId }))) return res.status(400).json({ error: 'Pick a batch.' });
  if (!Array.isArray(sessions) || !sessions.length) return res.status(400).json({ error: 'No sessions to schedule.' });
  if (sessions.length > 60) return res.status(400).json({ error: 'At most 60 sessions at once.' });

  const docs = [];
  for (const [i, s] of sessions.entries()) {
    const title = String(s?.title || '').trim();
    const start = new Date(s?.startsAt);
    const end = s?.endsAt ? new Date(s.endsAt) : null;
    if (!title) return res.status(400).json({ error: `Session ${i + 1} needs a title.` });
    if (Number.isNaN(+start)) return res.status(400).json({ error: `Session ${i + 1} has no valid start time.` });
    if (end && (Number.isNaN(+end) || end <= start)) return res.status(400).json({ error: `Session ${i + 1} ends before it starts.` });
    // Never pair a row's own link with the shared meeting id — different meetings.
    const ownUrl = String(s?.joinUrl || '').trim();
    const url = ownUrl || String(joinUrl).trim();
    const meetingId = ownUrl ? meetingIdFrom(s?.zoomMeetingId, ownUrl) : meetingIdFrom(zoomMeetingId, joinUrl);
    docs.push({ batchId, title, startsAt: start, endsAt: end, joinUrl: url, zoomMeetingId: meetingId });
  }
  const created = await Session.insertMany(docs);
  res.status(201).json({ sessions: created });
});

// PATCH /api/lms/sessions/:id — admin edits (e.g. add recordingUrl).
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const allowed = (({ title, startsAt, endsAt, joinUrl, recordingUrl, zoomMeetingId }) => ({ title, startsAt, endsAt, joinUrl, recordingUrl, zoomMeetingId }))(req.body || {});
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  if (allowed.zoomMeetingId !== undefined) allowed.zoomMeetingId = normMeetingId(allowed.zoomMeetingId);
  // A new link is a new meeting: re-derive the id from it, unless a DIFFERENT
  // id was typed alongside. An edit form echoing the old id back with the new
  // link would otherwise leave attendance matching the old meeting.
  const linkChanged = allowed.joinUrl !== undefined && allowed.joinUrl !== session.joinUrl;
  if (linkChanged && (!allowed.zoomMeetingId || allowed.zoomMeetingId === session.zoomMeetingId)) {
    allowed.zoomMeetingId = extractMeetingId(allowed.joinUrl);
  }
  // Moved in time → the class has not "happened" yet as far as the absence
  // sweep knows; let it look again after the new end.
  const moved = (allowed.startsAt && +new Date(allowed.startsAt) !== +session.startsAt)
    || (allowed.endsAt !== undefined && +new Date(allowed.endsAt || 0) !== +(session.endsAt || 0));
  if (moved) allowed.absenceSweptAt = null;
  Object.assign(session, allowed);
  await session.save();
  res.json({ session });
});

// DELETE /api/lms/sessions/:id — admin removes a class (cancelled, or a bulk
// schedule got a date wrong). Its attendance goes with it: left behind, those
// rows would still count toward every student's percentage for a class that
// no longer exists.
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const session = await Session.findByIdAndDelete(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const { deletedCount } = await Attendance.deleteMany({ sessionId: session._id });
  res.json({ ok: true, attendanceRemoved: deletedCount });
});

export default router;
