// Did the people just added to a batch get their login mail? Read-only.
//
//   node scripts/welcomeMailStatus.js            # students added in the last 7 days
//   node scripts/welcomeMailStatus.js 14         # … the last 14 days
//
// The LMS keeps no record of mail it sent: the admin screen says "emailed" or
// not once, at the moment of adding, and then it is gone. Resend keeps the
// record, so this joins the two — every student account created in the window,
// plus every student of a batch created in the window (an existing account
// moved into a new batch is sent nothing, by design, and shows as such) —
// against Resend's log for that address.
//
//   delivered      in their inbox
//   bounced        the address does not exist — fix it on the Students page
//   complained     they marked it as spam
//   sent/queued    accepted, not yet confirmed
//   NOT SENT       Resend has no login mail for them: either the account
//                  already existed (nothing is sent then), or the send failed
//                  and the admin screen said "not emailed". Reset the password
//                  from the Students page to send fresh credentials.
//
// Touches nothing: it reads lms_users and lms_batches and Resend's list API.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../db.js';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';

const DAYS = Number(process.argv[2]) || 7;
const since = new Date(Date.now() - DAYS * 864e5);
const LOGIN_SUBJECT = /Menler (LMS )?login|Menler LMS password was reset/i;

async function resendLog() {
  const key = String(process.env.RESEND_API_KEY || '').replace(/\s+/g, '');
  if (!key) return { error: 'RESEND_API_KEY is not set, so delivery status cannot be read.' };
  const rows = [];
  let after = '';
  for (let page = 0; page < 20; page++) {
    const r = await fetch(`https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ''}`, { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: `Resend refused the list (${r.status}): ${j.message || 'no reason given'}. A send-only key cannot list mail.` };
    const data = j.data || [];
    rows.push(...data);
    if (!j.has_more || !data.length) break;
    if (new Date(data[data.length - 1].created_at) < new Date(since.getTime() - 864e5)) break;
    after = data[data.length - 1].id;
  }
  // address → newest login mail
  const byTo = new Map();
  for (const e of rows) {
    if (!LOGIN_SUBJECT.test(e.subject || '')) continue;
    for (const to of e.to || []) {
      const k = String(to).toLowerCase();
      const have = byTo.get(k);
      if (!have || new Date(e.created_at) > new Date(have.created_at)) byTo.set(k, e);
    }
  }
  return { byTo };
}

const ist = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

async function run() {
  await connectDb();
  console.log(`(read-only) students added since ${ist(since)} IST\n`);

  const newBatches = await Batch.find({ createdAt: { $gte: since } }).select('_id').lean();
  const students = await User.find({
    role: 'student',
    $or: [{ createdAt: { $gte: since } }, { batchIds: { $in: newBatches.map((b) => b._id) } }],
  }).select('email fullName createdAt batchIds mustChangePassword lastActiveAt').sort({ createdAt: -1 }).lean();
  if (!students.length) { console.log('Nobody. No student account was created, and no new batch has students.'); return; }

  const batchNames = new Map((await Batch.find({ _id: { $in: students.flatMap((s) => s.batchIds || []) } }).select('name').lean()).map((b) => [String(b._id), b.name]));
  const { byTo, error } = await resendLog();
  if (error) console.log(`! ${error}\n`);

  const tally = {};
  for (const s of students) {
    const mail = byTo?.get(String(s.email).toLowerCase());
    const status = error ? '?' : mail ? (mail.last_event || 'sent') : 'NOT SENT';
    tally[status] = (tally[status] || 0) + 1;
    const batches = (s.batchIds || []).map((id) => batchNames.get(String(id))).filter(Boolean).join(', ') || 'no batch';
    const seen = s.lastActiveAt ? 'has logged in' : s.mustChangePassword ? 'never logged in' : 'not seen yet';
    console.log(`${status.padEnd(10)} ${s.email}`);
    console.log(`${' '.repeat(11)}${s.fullName || '(no name)'} · ${batches} · added ${ist(s.createdAt)} · ${seen}${mail ? ` · mailed ${ist(mail.created_at)}` : ''}`);
  }
  console.log(`\n${students.length} students · ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(' · ')}`);
}

run()
  .catch((e) => { console.error('welcomeMailStatus failed:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
