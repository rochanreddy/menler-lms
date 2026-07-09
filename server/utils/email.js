// Minimal mailer. Until SMTP is wired (add nodemailer + SMTP_* env vars), it
// logs the message to the console so password-reset links are testable in dev.
export function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail({ to, subject, text }) {
  if (!isSmtpConfigured()) {
    console.log(`\n[email:dev] to=${to}\nsubject=${subject}\n${text}\n`);
    return;
  }
  // TODO: swap for nodemailer once SMTP_* is set:
  //   const nodemailer = (await import('nodemailer')).default;
  //   const t = nodemailer.createTransport({ host, port, auth: { user, pass } });
  //   await t.sendMail({ from, to, subject, text });
  console.log(`[email] would send to ${to}: ${subject}`);
}
