import { Router } from 'express';
import crypto from 'crypto';
import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { isWithinWindow, sessionStart, normMeetingId } from '../utils/sessionTime.js';
import { recordJoin, recordLeave } from '../utils/presence.js';

// Zoom webhook — records how long a student was ACTUALLY in the meeting.
//
// A join opens an interval and a leave closes it; the time between the two,
// clipped to the class itself, is what the 45% rule in utils/attendanceRule.js
// measures. Zoom pushes `meeting.participant_joined` and
// `meeting.participant_left`; we match each to a session by meeting id and to a
// student by email. Verified with the app's Webhook Secret Token (Zoom
// Marketplace → your app → Feature → Webhook).
//
// Joining still marks present the moment it happens, exactly as it did before
// this rule existed. The rule only ever DEMOTES, and only in the sweep once the
// class is over — so a class in progress reads the same as it always has, and a
// cohort whose leave events never arrive is never wrongly marked absent.
const router = Router();
const SECRET = () => process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '';

function verify(req) {
  const ts = req.headers['x-zm-request-timestamp'];
  const sig = req.headers['x-zm-signature'];
  if (!ts || !sig || !SECRET() || !req.rawBody) return false;

  // Reject stale requests — otherwise a captured signature stays valid
  // forever and can be replayed to re-mark attendance. The header is Unix
  // seconds; 5 minutes is Zoom's own documented tolerance window.
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return false;

  const message = `v0:${ts}:${req.rawBody.toString('utf8')}`;
  const expected = Buffer.from(`v0=${crypto.createHmac('sha256', SECRET()).update(message).digest('hex')}`);
  const actual = Buffer.from(String(sig));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Which class does this event belong to?
//
// A cohort usually runs every class on ONE recurring Zoom meeting, so the
// meeting id alone names a dozen sessions. The one that counts is the one on at
// the moment they joined, and in a batch they are in — matching by id alone
// used to credit every join to the first class.
async function sessionFor(meetingId, studentId, at) {
  const onNow = (await Session.find({ zoomMeetingId: meetingId })).filter((s) => isWithinWindow(s, at));
  if (!onNow.length) return null;
  const mine = new Set(
    (await Batch.find({ _id: { $in: onNow.map((s) => s.batchId) }, studentIds: studentId }).select('_id'))
      .map((b) => String(b._id)),
  );
  return onNow
    .filter((s) => mine.has(String(s.batchId)))
    .sort((a, b) => Math.abs(sessionStart(a) - at) - Math.abs(sessionStart(b) - at))[0] || null;
}

// POST /api/lms/zoom/webhook  (public — Zoom calls this; secured by signature)
router.post('/webhook', async (req, res) => {
  const body = req.body || {};

  // 1) One-time URL validation handshake when you save the webhook in Zoom.
  if (body.event === 'endpoint.url_validation') {
    const plainToken = body.payload?.plainToken || '';
    const encryptedToken = crypto.createHmac('sha256', SECRET()).update(plainToken).digest('hex');
    return res.json({ plainToken, encryptedToken });
  }

  // 2) Verify every real event.
  if (!verify(req)) return res.status(401).json({ error: 'Invalid signature' });

  // 3) Presence: a join opens an interval, a leave closes it.
  const joined = body.event === 'meeting.participant_joined';
  const left = body.event === 'meeting.participant_left';

  if (joined || left) {
    try {
      const meetingId = normMeetingId(body.payload?.object?.id);
      const p = body.payload?.object?.participant || {};
      const email = String(p.email || '').toLowerCase().trim();

      // Zoom's own clock, not when the event reached us — that can lag, or be
      // a retry of something that happened minutes ago.
      const joinMs = Date.parse(p.join_time) || null;
      const leaveMs = Date.parse(p.leave_time) || Number(body.event_ts) || Date.now();
      // Match on when they JOINED, even for a leave: a class that ended moments
      // ago should still claim its own departures.
      const at = joined ? joinMs || leaveMs : joinMs || leaveMs;

      const student = meetingId && email
        ? await User.findOne({ email, role: 'student' }).select('_id')
        : null;
      const session = student ? await sessionFor(meetingId, student._id, at) : null;

      // An event that matches nothing is the quiet failure here, and it has two
      // everyday causes worth telling apart: a student who joined Zoom under an
      // address the LMS does not know them by, and a meeting id that belongs to
      // no class that was on at the time. Both look identical from the outside
      // — no attendance — so they are named in the log. The address is only
      // written when the match failed, which is the only time it helps.
      if (!student) {
        console.warn(`[zoom] ${body.event}: no student for ${email || '(no email)'} on meeting ${meetingId || '(none)'}`);
        return res.json({ ok: true });
      }
      if (!session) {
        console.warn(`[zoom] ${body.event}: no class on meeting ${meetingId} at ${new Date(at).toISOString()}`);
        return res.json({ ok: true });
      }

      if (joined) {
        await recordJoin(session, student._id, at);
        console.log(`[zoom] joined  ${session.title} — 1 student`);
      } else {
        const add = await recordLeave(session, student._id, leaveMs, joinMs);
        console.log(`[zoom] left    ${session.title} — +${Math.round(add / 60000)} min counted`);
      }
    } catch (err) {
      console.error(`zoom ${body.event} error:`, err.message);
    }
  }

  res.json({ ok: true }); // ack fast so Zoom doesn't retry
});

export default router;
