import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { MailCampaign } from '../models/MailCampaign.js';
import { Batch } from '../models/Batch.js';
import { isMailConfigured, isResendConfigured, isSmtpConfigured, sendMail } from '../utils/email.js';
import { PLACEHOLDERS, audienceOf, renderFor, runCampaign } from '../utils/mailCampaigns.js';
import { rateLimit } from '../utils/rateLimit.js';

// The admin's Mail tab: a subject and a body (the shell around them is
// fixed), sent to a batch at one or more times, plus a preview and a test
// send. Admin only, all of it — a mentor writes to students through the
// classroom, not a mailer.
const router = Router();
router.use(requireAuth, requireRole('admin'));

const MAX_SUBJECT = 200;
const MAX_BODY = 20000;
// One compose can go out at several times in a day (a morning nudge, an
// hour-before reminder). Each time is its own row; this caps the fan-out.
const MAX_TIMES = 12;
// A send that is due within this long is run straight away rather than left
// for the minute tick, so "Send now" means now.
const IMMEDIATE_MS = 30 * 1000;

function cleanCopy(body) {
  const subject = String(body?.subject || '').trim().slice(0, MAX_SUBJECT);
  const text = String(body?.body || '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_BODY);
  return { subject, body: text };
}

async function batchesPayload() {
  const batches = await Batch.find().select('name programId studentIds mentorIds status').populate('programId', 'title').sort({ createdAt: -1 }).lean();
  return batches.map((b) => ({
    id: String(b._id),
    name: b.name,
    program: b.programId?.title || '',
    programId: b.programId?._id ? String(b.programId._id) : '',
    students: (b.studentIds || []).length,
    mentors: (b.mentorIds || []).length,
    status: b.status,
  }));
}

function campaignOut(c, B) {
  return {
    _id: c._id,
    subject: c.subject,
    body: c.body,
    batchIds: (c.batchIds || []).map(String),
    batches: (c.batchIds || []).map((id) => B[String(id)]?.name || 'Removed batch'),
    includeMentors: !!c.includeMentors,
    sendAt: c.sendAt,
    status: c.status,
    startedAt: c.startedAt,
    finishedAt: c.finishedAt,
    recipients: c.recipients,
    delivered: c.delivered,
    failed: c.failed,
    error: c.error,
    // Only the misses: a list of forty "ok" rows tells the admin nothing the
    // count does not.
    failures: (c.results || []).filter((r) => !r.ok).map((r) => ({ email: r.email, error: r.error })),
    createdAt: c.createdAt,
    cancelledAt: c.cancelledAt,
  };
}

// GET /api/lms/mail — everything the tab needs in one call.
router.get('/', async (_req, res) => {
  const [batches, campaigns] = await Promise.all([
    batchesPayload(),
    MailCampaign.find().sort({ sendAt: -1 }).limit(200).lean(),
  ]);
  const B = Object.fromEntries(batches.map((b) => [b.id, b]));
  res.json({
    mail: {
      configured: isMailConfigured(),
      provider: isResendConfigured() ? 'resend' : isSmtpConfigured() ? 'smtp' : 'none',
    },
    placeholders: PLACEHOLDERS,
    batches,
    campaigns: campaigns.map((c) => campaignOut(c, B)),
  });
});

async function sampleBatch(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return Batch.findById(id).select('name programId').populate('programId', 'title');
}

// POST /api/lms/mail/preview { subject, body, batchId } — the mail as one
// recipient would see it, rendered for the admin themself so the placeholders
// fill with something real. The client puts the html in a sandboxed iframe.
router.post('/preview', async (req, res) => {
  const copy = cleanCopy(req.body);
  const msg = renderFor(copy, req.user, await sampleBatch(req.body?.batchId));
  res.json({ subject: msg.subject, html: msg.html, text: msg.text });
});

// POST /api/lms/mail/test { subject, body, batchId, to } — send one copy to an
// address of the admin's choosing (their own account's by default), so the
// mail can be read in a real inbox before a batch gets it. Capped because a
// test button under a finger is how a free tier's daily hundred goes in an
// afternoon.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post('/test', async (req, res) => {
  const copy = cleanCopy(req.body);
  if (!copy.subject || !copy.body) return res.status(400).json({ error: 'Write a subject and a body first.' });
  const to = String(req.body?.to || req.user.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'That is not an email address.' });
  if (!isMailConfigured()) return res.status(400).json({ error: 'Email is not configured on the server, so nothing can be sent.' });
  if (!(await rateLimit(`mailtest:${req.user._id}`, 10, 60 * 60 * 1000))) {
    return res.status(429).json({ error: 'That is ten test mails in an hour. Try the preview instead.' });
  }
  const msg = renderFor(copy, req.user, await sampleBatch(req.body?.batchId));
  try {
    await sendMail({ to, subject: `[Test] ${msg.subject}`, text: msg.text, html: msg.html });
  } catch (err) {
    return res.status(502).json({ error: `The mail provider refused it: ${err.message}` });
  }
  res.json({ ok: true, to });
});

// ── Campaigns ──────────────────────────────────────────────────────────────

async function validBatchIds(ids) {
  // A malformed id would make the query throw a cast error and 500; drop it.
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter((x) => mongoose.isValidObjectId(x)))];
  if (!wanted.length) return [];
  const found = await Batch.find({ _id: { $in: wanted } }).select('_id');
  return found.map((b) => b._id);
}

function parseSendAt(v) {
  if (v === undefined || v === null || v === '' || v === 'now') return new Date();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// `sendAts` (a list) or `sendAt` (one). Deduped and sorted, so two entries
// for the same minute are one row, and the response reads in time order.
function parseSendAts(body) {
  const raw = Array.isArray(body?.sendAts) ? body.sendAts : [body?.sendAt];
  const times = [];
  for (const v of raw) {
    const d = parseSendAt(v);
    if (!d) return null;
    times.push(d.getTime());
  }
  return [...new Set(times)].sort((a, b) => a - b).map((t) => new Date(t));
}

async function replyWith(res, ids, status = 200) {
  const B = Object.fromEntries((await batchesPayload()).map((b) => [b.id, b]));
  const rows = await MailCampaign.find({ _id: { $in: ids } }).sort({ sendAt: 1 }).lean();
  const campaigns = rows.map((c) => campaignOut(c, B));
  res.status(status).json({ campaigns, campaign: campaigns[0] || null });
}

// POST /api/lms/mail/campaigns { batchIds, includeMentors, subject, body,
//                                sendAts[] | sendAt }
//
// One row per time. Each is an instant (ISO): the client resolves "Friday
// 7 pm" on the admin's own clock, same as classes and doubt sessions.
// Omitted, 'now', or in the past means now.
router.post('/campaigns', async (req, res) => {
  const copy = cleanCopy(req.body);
  if (!copy.subject) return res.status(400).json({ error: 'A subject is required.' });
  if (!copy.body) return res.status(400).json({ error: 'The body is empty.' });
  const batchIds = await validBatchIds(req.body?.batchIds);
  if (!batchIds.length) return res.status(400).json({ error: 'Pick at least one batch.' });
  const sendAts = parseSendAts(req.body);
  if (!sendAts) return res.status(400).json({ error: 'One of the send times is not a date.' });
  if (!sendAts.length) return res.status(400).json({ error: 'Pick at least one send time.' });
  if (sendAts.length > MAX_TIMES) return res.status(400).json({ error: `That is more than ${MAX_TIMES} send times.` });

  // Tell the admin how many it will reach; the send itself recomputes, since
  // a student enrolled tonight should get Friday's mail.
  const includeMentors = !!req.body?.includeMentors;
  const planned = (await audienceOf({ batchIds, includeMentors })).length;

  const rows = await MailCampaign.insertMany(sendAts.map((sendAt) => ({
    batchIds,
    includeMentors,
    ...copy,
    sendAt,
    recipients: planned,
    createdBy: req.user._id,
  })));

  for (const c of rows) {
    if (c.sendAt.getTime() <= Date.now() + IMMEDIATE_MS) await runCampaign(c._id);
  }
  await replyWith(res, rows.map((c) => c._id), 201);
});

// PUT /api/lms/mail/campaigns/:id — reword or move a mail that has not gone
// yet. Anything already sending or sent is history and stays as it was.
router.put('/campaigns/:id', async (req, res) => {
  const c = await MailCampaign.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });
  if (c.status !== 'scheduled') return res.status(409).json({ error: 'That mail has already gone out (or was cancelled), so it cannot be edited. Reuse it instead.' });

  if (req.body?.subject !== undefined || req.body?.body !== undefined) {
    const copy = cleanCopy({ subject: req.body?.subject ?? c.subject, body: req.body?.body ?? c.body });
    if (!copy.subject) return res.status(400).json({ error: 'A subject is required.' });
    if (!copy.body) return res.status(400).json({ error: 'The body is empty.' });
    c.subject = copy.subject;
    c.body = copy.body;
  }
  if (req.body?.batchIds !== undefined) {
    const batchIds = await validBatchIds(req.body.batchIds);
    if (!batchIds.length) return res.status(400).json({ error: 'Pick at least one batch.' });
    c.batchIds = batchIds;
  }
  if (req.body?.includeMentors !== undefined) c.includeMentors = !!req.body.includeMentors;
  if (req.body?.sendAt !== undefined) {
    const sendAt = parseSendAt(req.body.sendAt);
    if (!sendAt) return res.status(400).json({ error: 'That send time is not a date.' });
    c.sendAt = sendAt;
  }
  c.recipients = (await audienceOf(c)).length;
  await c.save();

  if (c.sendAt.getTime() <= Date.now() + IMMEDIATE_MS) await runCampaign(c._id);
  await replyWith(res, [c._id]);
});

// POST /api/lms/mail/campaigns/:id/send — don't wait for the scheduled time.
router.post('/campaigns/:id/send', async (req, res) => {
  const c = await MailCampaign.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });
  if (c.status !== 'scheduled') return res.status(409).json({ error: 'That mail is not waiting to be sent.' });
  await MailCampaign.updateOne({ _id: c._id }, { $set: { sendAt: new Date() } });
  await runCampaign(c._id);
  await replyWith(res, [c._id]);
});

// DELETE /api/lms/mail/campaigns/:id — a scheduled mail is cancelled and kept
// as a record; a finished one is removed from the list.
router.delete('/campaigns/:id', async (req, res) => {
  const c = await MailCampaign.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });
  if (c.status === 'sending') return res.status(409).json({ error: 'That mail is being sent right now.' });
  if (c.status === 'scheduled') {
    const r = await MailCampaign.updateOne({ _id: c._id, status: 'scheduled' }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
    // Lost the race with the scheduler: it went out between the read and the
    // write. Say so rather than report a cancellation that did not happen.
    if (!r.modifiedCount) return res.status(409).json({ error: 'Too late: that mail has just started sending.' });
    return res.json({ ok: true, cancelled: true });
  }
  await MailCampaign.deleteOne({ _id: c._id });
  res.json({ ok: true, removed: true });
});

// GET /api/lms/mail/campaigns/:id/recipients — who a scheduled mail will reach
// right now. The compose form shows the count; this is the list behind it.
router.get('/campaigns/:id/recipients', async (req, res) => {
  const c = await MailCampaign.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });
  const audience = await audienceOf(c);
  res.json({
    recipients: audience.map(({ user, batch }) => ({ name: user.fullName, email: user.email, role: user.role, batch: batch.name })),
  });
});

// GET /api/lms/mail/audience?batchIds=a,b&mentors=1 — the same count before
// the campaign exists, for the compose form's "will reach N" line.
router.get('/audience', async (req, res) => {
  const batchIds = await validBatchIds(String(req.query.batchIds || '').split(','));
  if (!batchIds.length) return res.json({ count: 0, sample: [] });
  const audience = await audienceOf({ batchIds, includeMentors: req.query.mentors === '1' });
  res.json({
    count: audience.length,
    sample: audience.slice(0, 5).map(({ user }) => user.fullName || user.email),
  });
});

export default router;
