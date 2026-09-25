// Mailer. Four ways out. Which one a mail takes depends on what kind of mail
// it is - see transportFor() below: the automatic reminders go out on
// ZeptoMail, and everything else (the admin's Mail tab, credentials, resets)
// on Resend.
//
//   ZeptoMail — ZEPTOMAIL_TOKEN set. HTTPS API, the same account menler.in
//               already sends on. Transactional and credit-based rather than
//               capped per day, which is what makes per-session mail to a
//               whole cohort affordable — see startSessionReminders(). Used by
//               the reminders only, unless nothing else is configured.
//   Resend    — RESEND_API_KEY set. The default for everything else. Plain
//               HTTPS, no SDK; the free tier is 100 emails/day, 3,000/month,
//               which is more than an admin sends by hand but far less than a
//               term of class reminders. `from` must be on a domain verified in
//               the Resend dashboard (or `onboarding@resend.dev`, which only
//               delivers to the account owner's own address).
//   SMTP      — SMTP_HOST/USER/PASS set (Gmail app password, Zoho, …). After
//               Resend on purpose: Render blocks outbound SMTP, so on the
//               deployed API this path cannot connect at all. It is here for
//               local work and for hosts that do allow it.
//   Console   — none set: the message is logged so reset links and temp
//               passwords stay testable in dev.
//
// Every caller goes through sendMail() so switching providers is an env
// change, never a code change.

export function isZeptoConfigured() {
  return !!process.env.ZEPTOMAIL_TOKEN;
}

export function isResendConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function isMailConfigured() {
  return isZeptoConfigured() || isResendConfigured() || isSmtpConfigured();
}

// MAIL_FROM wins; SMTP_FROM is honoured for installs that predate it. Quotes
// are stripped because a dashboard (Render, say) passes them through verbatim
// where a .env file would have eaten them, and Resend 422s on the result.
const unquote = (s) => String(s || '').trim().replace(/^["']+|["']+$/g, '').trim();
function fromAddress() {
  return unquote(process.env.MAIL_FROM) || unquote(process.env.SMTP_FROM) || (process.env.SMTP_USER ? `Menler <${process.env.SMTP_USER}>` : 'Menler <onboarding@resend.dev>');
}

let cachedTransport = null;
async function getTransport() {
  if (cachedTransport) return cachedTransport;
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(process.env.SMTP_PORT || 587);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedTransport;
}

// `attachments` is [{ filename, content: Buffer, contentType }] — the shape
// nodemailer takes as it is. Resend wants the bytes base64'd in the JSON.
const forResend = (attachments) =>
  attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64'), ...(a.contentType ? { content_type: a.contentType } : {}) }));

// ZeptoMail wants the sender split into name and address, where every other
// transport here takes the one "Menler <no-reply@menler.in>" string.
function parseAddress(str) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(String(str || ''));
  if (m) return { ...(m[1] ? { name: m[1] } : {}), email: m[2].trim() };
  return { email: String(str || '').trim() };
}

// The same bytes again, under ZeptoMail's names. This matters as much as the
// send itself: the admin panel mails files, so a transport that quietly
// dropped them would deliver the covering letter without the thing it is
// about — and look like it worked.
const forZepto = (attachments) =>
  attachments.map((a) => ({
    content: Buffer.from(a.content).toString('base64'),
    mime_type: a.contentType || 'application/octet-stream',
    name: a.filename,
  }));

// ZeptoMail's India data centre, to match the domain menler.in is verified on.
// Override with ZEPTOMAIL_API_URL for the global (.com) one.
const zeptoUrl = () => process.env.ZEPTOMAIL_API_URL || 'https://api.zeptomail.in/v1.1/email';

async function sendViaZepto({ from, to, subject, text, html, replyTo, attachments }) {
  const sender = parseAddress(from);
  // The token may be pasted raw or already carrying its scheme prefix.
  const token = process.env.ZEPTOMAIL_TOKEN;
  const auth = token.startsWith('Zoho-enczapikey') ? token : `Zoho-enczapikey ${token}`;
  // A reminder sweep sends in a loop; without a timeout one hung socket would
  // stall every student behind it in the queue.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(zeptoUrl(), {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        from: { address: sender.email, ...(sender.name ? { name: sender.name } : {}) },
        to: [{ email_address: { address: to } }],
        subject,
        ...(html ? { htmlbody: html } : {}),
        ...(text ? { textbody: text } : {}),
        ...(replyTo ? { reply_to: [{ address: replyTo }] } : {}),
        ...(attachments?.length ? { attachments: forZepto(attachments) } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ZeptoMail ${res.status}: ${body.slice(0, 300)}`);
    }
    return { provider: 'zeptomail' };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaResend({ from, to, subject, text, html, replyTo, attachments }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject, text, html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments?.length ? { attachments: forResend(attachments) } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message || body?.name || 'send failed'}`);
  return { id: body.id, provider: 'resend' };
}

/**
 * Which transport a mail goes out on.
 *
 * Two kinds of mail, two routes:
 *
 *   default      everything a person sends or triggers - the admin's Mail
 *                tab, a test mail, account credentials, password resets.
 *                Resend first, SMTP second, and ZeptoMail only when neither is
 *                set, so an admin mail never depends on the reminder account.
 *   'zeptomail'  the automatic reminders (sessionReminders, assignmentReminders),
 *                which mail a whole cohort per class and need ZeptoMail's
 *                credit-based sending rather than Resend's 100 a day. They ask
 *                for it by name, and fall back to the default route if it is
 *                not configured.
 *
 * ZeptoMail used to be first for everything, which put every admin mail on
 * the reminder account: when its sender was not verified, the whole Mail tab
 * failed with "Sender address not verified" while Resend sat configured and
 * unused behind it.
 */
export function transportFor(via) {
  const order = via === 'zeptomail' ? ['zeptomail', 'resend', 'smtp'] : ['resend', 'smtp', 'zeptomail'];
  const configured = {
    zeptomail: isZeptoConfigured(),
    resend: isResendConfigured(),
    smtp: isSmtpConfigured(),
  };
  return order.find((name) => configured[name]) || null;
}

export async function sendMail({ to, subject, text, html, replyTo, attachments, via }) {
  const transportName = transportFor(via);
  if (!transportName) {
    const files = attachments?.length ? `attachments=${attachments.map((a) => a.filename).join(', ')}\n` : '';
    console.log(`\n[email:dev] to=${to}\nsubject=${subject}\n${files}${text || ''}\n`);
    return { dev: true };
  }
  const from = fromAddress();
  const reply = replyTo || unquote(process.env.MAIL_REPLY_TO) || undefined;
  if (transportName === 'zeptomail') return sendViaZepto({ from, to, subject, text, html, replyTo: reply, attachments });
  if (transportName === 'resend') return sendViaResend({ from, to, subject, text, html, replyTo: reply, attachments });
  const transport = await getTransport();
  const info = await transport.sendMail({ from, to, subject, text, html, replyTo: reply, ...(attachments?.length ? { attachments } : {}) });
  return { id: info?.messageId, provider: 'smtp' };
}

// For fire-and-forget callers that must not fail the request when the mail
// does — a provisioned account is still provisioned if Resend is down.
// Returns { emailed, error? } so the response can tell the admin which.
export async function trySendMail(message) {
  try {
    const r = await sendMail(message);
    return { emailed: !r.dev, dev: !!r.dev };
  } catch (err) {
    console.error(`[email] to=${message.to} failed:`, err?.message || err);
    return { emailed: false, error: err?.message || 'send failed' };
  }
}
