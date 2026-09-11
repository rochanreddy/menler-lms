import { Router } from 'express';
import crypto from 'crypto';
import { Session } from '../models/Session.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { isWithinWindow, sessionStart, normMeetingId } from '../utils/sessionTime.js';

// Zoom webhook — marks a student present when they ACTUALLY join the meeting.
// Zoom pushes a `meeting.participant_joined` event; we match it to a session by
// meeting id and to a student by email, then mark attendance. Verified with the
// app's Webhook Secret Token (Zoom Marketplace → your app → Feature → Webhook).
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

  // 3) A participant joined → credit attendance.
  if (body.event === 'meeting.participant_joined') {
    try {
      const meetingId = normMeetingId(body.payload?.object?.id);
      const p = body.payload?.object?.participant || {};
      const email = String(p.email || '').toLowerCase().trim();
      // When they joined, by Zoom's clock — not when the event reached us,
      // which can lag or be a retry.
      const joinedAt = Date.parse(p.join_time) || Number(body.event_ts) || Date.now();
      const student = meetingId && email ? await User.findOne({ email, role: 'student' }).select('_id') : null;
      if (student) {
        // A cohort usually runs every class on ONE recurring Zoom meeting, so
        // the meeting id alone names a dozen sessions. The one that counts is
        // the one on at the moment they joined, and in a batch they are in —
        // matching by id alone used to credit every join to the first class.
        const onNow = (await Session.find({ zoomMeetingId: meetingId })).filter((s) => isWithinWindow(s, joinedAt));
        if (onNow.length) {
          const mine = new Set((await Batch.find({ _id: { $in: onNow.map((s) => s.batchId) }, studentIds: student._id }).select('_id')).map((b) => String(b._id)));
          const session = onNow
            .filter((s) => mine.has(String(s.batchId)))
            .sort((a, b) => Math.abs(sessionStart(a) - joinedAt) - Math.abs(sessionStart(b) - joinedAt))[0];
          if (session) {
            await Attendance.updateOne(
              { sessionId: session._id, studentId: student._id },
              { $set: { status: 'present', batchId: session.batchId } },
              { upsert: true },
            );
          }
        }
      }
    } catch (err) {
      console.error('zoom participant_joined error:', err.message);
    }
  }

  res.json({ ok: true }); // ack fast so Zoom doesn't retry
});

export default router;
