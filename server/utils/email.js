// Mailer. Three ways out, tried in this order:
//
//   1. Resend   — RESEND_API_KEY set. Plain HTTPS, no SDK; the free tier is
//                 100 emails/day, 3,000/month, which is more than an admin
//                 provisions by hand. `from` must be on a domain verified in
//                 the Resend dashboard (or `onboarding@resend.dev`, which
//                 only delivers to the account owner's own address).
//   2. SMTP     — SMTP_HOST/USER/PASS set (Gmail app password, Zoho, …).
//   3. Console  — neither set: the message is logged so reset links and
//                 temp passwords stay testable in dev.
//
// Every caller goes through sendMail() so switching providers is an env
// change, never a code change.

export function isResendConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function isMailConfigured() {
  return isResendConfigured() || isSmtpConfigured();
}

// MAIL_FROM wins; SMTP_FROM is honoured for installs that predate it.
function fromAddress() {
  return process.env.MAIL_FROM || process.env.SMTP_FROM || (process.env.SMTP_USER ? `Menler <${process.env.SMTP_USER}>` : 'Menler <onboarding@resend.dev>');
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

async function sendViaResend({ from, to, subject, text, html, replyTo }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message || body?.name || 'send failed'}`);
  return { id: body.id, provider: 'resend' };
}

export async function sendMail({ to, subject, text, html, replyTo }) {
  if (!isMailConfigured()) {
    console.log(`\n[email:dev] to=${to}\nsubject=${subject}\n${text || ''}\n`);
    return { dev: true };
  }
  const from = fromAddress();
  if (isResendConfigured()) return sendViaResend({ from, to, subject, text, html, replyTo });
  const transport = await getTransport();
  const info = await transport.sendMail({ from, to, subject, text, html, replyTo });
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
