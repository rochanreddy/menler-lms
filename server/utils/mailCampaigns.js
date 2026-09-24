import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { MailCampaign } from '../models/MailCampaign.js';
import { FileAsset } from '../models/FileAsset.js';
import { sha256 } from './curriculumPdfAssets.js';
// audienceOf populates the batch's programme; registering the model here keeps
// the util usable from a script that never loaded the routes.
import '../models/Program.js';
import { sendMail, isMailConfigured, isResendConfigured } from './email.js';
import { broadcastEmail } from './emailTemplates.js';

// The admin's mail-merge. One campaign → one rendered mail per recipient.
//
// PLACEHOLDERS is the whole vocabulary an admin can use in a subject or body.
// It is small on purpose: every entry has to be something the LMS actually
// knows about a person at send time, and be worth explaining on the compose
// form. `{{batch}}` and `{{programme}}` are the batch the mail is FOR — a
// student in both cohorts who is picked through Kickstarter reads
// "Kickstarter", not whichever batch happens to be first on their account.
export const PLACEHOLDERS = [
  { key: 'first_name', label: 'First name', example: 'Aarav' },
  { key: 'name', label: 'Full name', example: 'Aarav Sharma' },
  { key: 'email', label: 'Email', example: 'aarav@example.com' },
  { key: 'batch', label: 'Batch', example: 'AI Kickstarter · Sept 2026' },
  { key: 'programme', label: 'Programme', example: 'AI Kickstarter' },
];

export function fillPlaceholders(text, vars) {
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? '') : m;
  });
}

const firstNameOf = (fullName, email) =>
  String(fullName || '').trim().split(/\s+/)[0] || String(email || '').split('@')[0] || 'there';

export function varsFor(user, batch) {
  return {
    first_name: firstNameOf(user.fullName, user.email),
    name: String(user.fullName || '').trim() || firstNameOf(user.fullName, user.email),
    email: user.email,
    batch: batch?.name || '',
    programme: batch?.programId?.title || '',
  };
}

/**
 * Everyone a campaign goes to, deduped, each tagged with the batch they were
 * picked through.
 *
 * Skips accounts the admin has locked out of the LMS and students blocked from
 * the batch in question — a mail about a class you cannot attend is a taunt.
 * A student in two selected batches is one person and gets one mail.
 */
export async function audienceOf(campaign) {
  const batches = await Batch.find({ _id: { $in: campaign.batchIds || [] } })
    .select('name programId studentIds mentorIds')
    .populate('programId', 'title');

  const ids = new Set();
  for (const b of batches) {
    for (const id of b.studentIds || []) ids.add(String(id));
    if (campaign.includeMentors) for (const id of b.mentorIds || []) ids.add(String(id));
  }
  if (!ids.size) return [];

  const users = await User.find({ _id: { $in: [...ids] }, 'blocked.lms': { $ne: true } })
    .select('fullName email role blocked.batchIds');
  const byId = new Map(users.map((u) => [String(u._id), u]));

  const out = [];
  const seen = new Set();
  for (const b of batches) {
    const members = [
      ...(b.studentIds || []).map((id) => ({ id: String(id), as: 'student' })),
      ...(campaign.includeMentors ? (b.mentorIds || []).map((id) => ({ id: String(id), as: 'mentor' })) : []),
    ];
    for (const { id, as } of members) {
      if (seen.has(id)) continue;
      const u = byId.get(id);
      if (!u || !u.email) continue;
      if (as === 'student' && u.role !== 'student') continue;
      if (as === 'mentor' && u.role !== 'mentor') continue;
      if (as === 'student' && (u.blocked?.batchIds || []).some((x) => String(x) === String(b._id))) continue;
      seen.add(id);
      out.push({ user: u, batch: b });
    }
  }
  return out;
}

// ── Attachments ───────────────────────────────────────────────────────────
//
// Uploaded first (POST /mail/attachments), then referenced by id from the
// compose. The bytes are a FileAsset, deduped on their hash like course PDFs,
// so the same timetable attached to six reminders is stored once.
//
// The limits are the mail's, not the disk's: every byte goes to every
// recipient, and Resend refuses a message over 40 MB once base64 has grown it
// by a third. Ten MB in all keeps a send well clear of that and of the
// inboxes that bounce big mail.
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // all files together

// What an admin plausibly sends a cohort. An allowlist, because Resend and
// most inboxes refuse executables anyway, and a refusal at send time is worse
// than one at upload.
const ATTACHMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|png|jpe?g|gif|webp|ics|zip)$/i;

// A filename as the recipient will see it: no path, no control characters,
// nothing a header could split on.
const cleanFilename = (s) =>
  String(s || 'attachment').split(/[\\/]/).pop().replace(/[\u0000-\u001f"<>|:*?]+/g, '_').trim().slice(0, 150) || 'attachment';

/** Why this multer file cannot go out with a mail, or '' when it can. */
export function attachmentProblem(file) {
  const name = cleanFilename(file.originalname);
  if (!ATTACHMENT_EXT.test(name)) return `${name}: that type of file cannot be attached. PDFs, Office files, images, CSV, text and zip are fine.`;
  if (/\.pdf$/i.test(name) && !file.buffer.subarray(0, 1024).includes('%PDF-')) return `${name} is not really a PDF.`;
  return '';
}

/** Store one uploaded file. Returns the attachment as the compose form keeps it. */
export async function storeMailAttachment(file, ownerId) {
  const name = cleanFilename(file.originalname);
  const hash = sha256(file.buffer);
  const mimeType = file.mimetype || 'application/octet-stream';
  const seen = await FileAsset.findOne({ kind: 'mail-attachment', hash }).select('_id');
  const asset = seen || await FileAsset.create({ data: file.buffer, name, mimeType, size: file.size, hash, ownerId, kind: 'mail-attachment' });
  return { id: String(asset._id), name, size: file.size, mimeType };
}

/**
 * Turn the compose form's list ([{ id, name }]) into the campaign's, checking
 * every file is still stored. The name travels with the id rather than coming
 * from the stored row, because the same bytes attached twice under two names
 * share one row and each mail should carry the name it was attached under.
 * Returns { attachments } or { error }.
 */
export async function resolveAttachments(list) {
  const wanted = (Array.isArray(list) ? list : [])
    .map((a) => (typeof a === 'string' ? { id: a } : a || {}))
    .filter((a) => /^[a-f0-9]{24}$/i.test(String(a.id || '')));
  const unique = [...new Map(wanted.map((a) => [String(a.id), a])).values()];
  if (!unique.length) return { attachments: [] };
  if (unique.length > MAX_ATTACHMENTS) return { error: `At most ${MAX_ATTACHMENTS} attachments to a mail.` };
  const rows = await FileAsset.find({ _id: { $in: unique.map((a) => a.id) }, kind: 'mail-attachment' }).select('_id name size mimeType');
  const byId = new Map(rows.map((r) => [String(r._id), r]));
  const attachments = [];
  for (const a of unique) {
    const r = byId.get(String(a.id));
    if (!r) return { error: 'One of the attachments is no longer stored. Remove it and attach the file again.' };
    attachments.push({ fileId: r._id, name: cleanFilename(a.name || r.name), size: r.size, mimeType: r.mimeType });
  }
  const total = attachments.reduce((n, a) => n + a.size, 0);
  if (total > MAX_ATTACHMENT_BYTES) return { error: 'The attachments come to more than 10 MB together. Put the big one on Drive and send the link instead.' };
  return { attachments };
}

/** The bytes, in the shape sendMail() takes. Throws when a file has gone. */
export async function attachmentFiles(attachments) {
  if (!attachments?.length) return [];
  const rows = await FileAsset.find({ _id: { $in: attachments.map((a) => a.fileId) } }).select('+data');
  const byId = new Map(rows.map((r) => [String(r._id), r]));
  return attachments.map((a) => {
    const r = byId.get(String(a.fileId));
    if (!r) throw new Error(`The attachment ${a.name} is no longer stored, so nothing was sent.`);
    return { filename: a.name, content: r.data, contentType: a.mimeType || r.mimeType };
  });
}

/**
 * Delete stored attachments no campaign points at any more. With `ids`, only
 * those (the files of a campaign just removed). Without, a sweep of uploads a
 * compose left behind and never sent — older than a day, so a form left open
 * over lunch keeps its files.
 */
export async function pruneAttachments(ids = null) {
  const filter = { kind: 'mail-attachment' };
  if (ids) {
    if (!ids.length) return 0;
    filter._id = { $in: ids };
  } else {
    filter.createdAt = { $lt: new Date(Date.now() - 24 * 3600 * 1000) };
  }
  const candidates = await FileAsset.find(filter).select('_id').lean();
  if (!candidates.length) return 0;
  const used = new Set((await MailCampaign.distinct('attachments.fileId', { 'attachments.fileId': { $in: candidates.map((c) => c._id) } })).map(String));
  const dead = candidates.filter((c) => !used.has(String(c._id))).map((c) => c._id);
  if (!dead.length) return 0;
  const r = await FileAsset.deleteMany({ _id: { $in: dead }, kind: 'mail-attachment' });
  return r.deletedCount || 0;
}

/** The mail one recipient would get — subject and body filled, shell around it. */
export function renderFor({ subject, body }, user, batch) {
  const vars = varsFor(user, batch);
  return broadcastEmail({
    fullName: user.fullName,
    email: user.email,
    subject: fillPlaceholders(subject, vars),
    body: fillPlaceholders(body, vars),
    batchName: batch?.name || '',
  });
}

// Resend's free tier takes two requests a second; a burst of thirty in one
// tick is refused from the third onward, which then reads as "the mail is
// flaky" rather than "we sent too fast". SMTP has no such rule, but a small
// gap costs nothing there either.
const gapMs = () => (isResendConfigured() ? 600 : 50);
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Deliver one campaign, end to end.
 *
 * Claims the row first with an atomic status flip, so a second instance (or
 * the same one after a restart) finds nothing to claim. Returns null when the
 * row was not in a claimable state — already sent, cancelled, or being sent
 * by someone else.
 */
export async function runCampaign(id) {
  const campaign = await MailCampaign.findOneAndUpdate(
    { _id: id, status: 'scheduled' },
    { $set: { status: 'sending', startedAt: new Date() } },
    { new: true },
  );
  if (!campaign) return null;

  const finish = async (patch) => {
    await MailCampaign.updateOne({ _id: campaign._id }, { $set: { finishedAt: new Date(), ...patch } });
    return { ...patch };
  };

  if (!isMailConfigured()) {
    // Nothing would leave the building; say so rather than sit in "sending"
    // or pretend the console log was a delivery.
    return finish({ status: 'failed', error: 'Email is not configured on the server (RESEND_API_KEY or SMTP_*).' });
  }

  let audience;
  try {
    audience = await audienceOf(campaign);
  } catch (err) {
    return finish({ status: 'failed', error: `Could not resolve the audience: ${err.message}` });
  }
  if (!audience.length) {
    return finish({ status: 'failed', recipients: 0, error: 'Nobody to send to: the batches picked have no students.' });
  }

  // Loaded once, sent to everyone. A file that has gone missing fails the
  // run: a mail that says "the timetable is attached" and is not is worse
  // than one that did not go.
  let files;
  try {
    files = await attachmentFiles(campaign.attachments);
  } catch (err) {
    return finish({ status: 'failed', recipients: audience.length, error: err.message });
  }

  await MailCampaign.updateOne({ _id: campaign._id }, { $set: { recipients: audience.length } });

  const results = [];
  let delivered = 0;
  let failed = 0;
  const gap = gapMs();
  for (const { user, batch } of audience) {
    const msg = renderFor(campaign, user, batch);
    try {
      await sendMail({ to: user.email, subject: msg.subject, text: msg.text, html: msg.html, attachments: files });
      delivered += 1;
      results.push({ userId: user._id, email: user.email, ok: true });
    } catch (err) {
      failed += 1;
      results.push({ userId: user._id, email: user.email, ok: false, error: String(err?.message || err).slice(0, 300) });
    }
    if (gap) await sleep(gap);
  }

  return finish({
    status: delivered ? 'sent' : 'failed',
    recipients: audience.length,
    delivered,
    failed,
    results,
    error: delivered ? '' : 'Every send failed. Check the mail provider.',
  });
}

// A campaign still `sending` this long after it started was interrupted — the
// process died mid-run. It is closed as failed rather than re-run: whoever
// was reached before the crash was reached, and sending again would double
// them up. The admin reads the counts and decides.
const STUCK_MS = 30 * 60 * 1000;
async function closeInterrupted(now) {
  const r = await MailCampaign.updateMany(
    { status: 'sending', startedAt: { $lt: new Date(now - STUCK_MS) } },
    { $set: { status: 'failed', finishedAt: new Date(now), error: 'Interrupted mid-send (the server restarted). Some recipients may have received it.' } },
  );
  if (r.modifiedCount) console.error(`[mail] closed ${r.modifiedCount} interrupted campaign(s)`);
}

/** Every campaign whose time has come. Returns how many were run. */
export async function runDueCampaigns(now = Date.now()) {
  await closeInterrupted(now);
  const due = await MailCampaign.find({ status: 'scheduled', sendAt: { $lte: new Date(now) } }).select('_id').sort({ sendAt: 1 });
  let ran = 0;
  for (const c of due) {
    const r = await runCampaign(c._id);
    if (!r) continue;
    ran += 1;
    const counts = r.delivered != null ? ` · ${r.delivered} delivered, ${r.failed} failed` : '';
    console.log(`[mail] campaign ${c._id}: ${r.status}${counts}${r.error ? ` · ${r.error}` : ''}`);
  }
  return ran;
}

// Once a minute, plus at boot so a server that slept through a send time (a
// Render instance spinning up after idle, a deploy) sends the moment it wakes
// rather than dropping the mail on the floor.
//
// A tick that is still sending when the next one fires is skipped: the claim
// is atomic so overlapping would be harmless, but there is nothing for the
// second tick to find anyway.
export function startMailScheduler(everyMs = 60 * 1000) {
  let running = false;
  let lastPrune = 0;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runDueCampaigns();
      // Abandoned uploads, hourly — nothing about them is urgent.
      if (Date.now() - lastPrune > 3600 * 1000) {
        lastPrune = Date.now();
        const n = await pruneAttachments();
        if (n) console.log(`[mail] removed ${n} unused attachment(s)`);
      }
    } catch (err) {
      console.error('[mail] scheduler tick failed:', err.message);
    } finally {
      running = false;
    }
  };
  run();
  const t = setInterval(run, everyMs);
  t.unref?.();
  return t;
}
