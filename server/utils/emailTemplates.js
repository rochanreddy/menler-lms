// The account emails, laid out on the same shell as
// docs/email-reference-enrollment-confirmation.html — banner, button, logo
// footer and permission bar, so an LMS login mail reads as the same company.
// The body copy is different: that template confirms a seat, these hand over
// a sign-in.
//
// Images are hot-linked from menler.in (public/email-banner.jpg,
// public/email-logo.png) — same as the marketing mailers.

import { appUrl } from './appUrl.js';

// Where the button points. Same env the password-reset link is built from —
// read through appUrl.js, because LMS_APP_URL is a comma-separated list in
// production, and pasting it into a URL whole produces a host of
// "lms.menler.in,https" that resolves nowhere.
export const loginUrl = () => appUrl('/login');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const firstNameOf = (fullName, email) => {
  const n = String(fullName || '').trim().split(/\s+/)[0];
  return n || String(email || '').split('@')[0] || 'there';
};

const P = (inner, top = 22) => `<p style="margin:${top}px 0 0; font-size:16px; line-height:1.8; color:#1F2430;">${inner}</p>`;

const BANNER = 'https://menler.in/email-banner.jpg';
const LOGO = 'https://menler.in/email-logo.png';

// Where a student writes when something is wrong. The mail is sent from a
// no-reply address, so every "tell us" has to name this instead.
const SUPPORT_EMAIL = 'support@menler.in';

// The shared Drive folder students work through before session one.
const PREREQUISITES_URL = 'https://drive.google.com/drive/folders/1yi0IWBMnztCtygN94Klb0AGq2DYB6bg2?usp=sharing';

// The permission bar sits on #1B1640, so a link there needs the light violet;
// the global `a{color:#534AB7}` would be near-invisible against it.
const mailtoLink = (color = '#534AB7') =>
  `<a href="mailto:${SUPPORT_EMAIL}" style="color:${color}; text-decoration:underline;">${SUPPORT_EMAIL}</a>`;

const DEFAULT_HELP = `If anything about signing in does not work, write to ${mailtoLink()}.`;

const FOOTER = `<tr><td bgcolor="#211B4C" class="px" style="background-color:#211B4C; padding:34px 40px 30px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>

    <td class="stack" width="56%" valign="top" style="width:56%;">
      <img src="${LOGO}" width="128" alt="menler" style="width:128px; height:auto; display:block;" />
      <div style="font-family:'DM Serif Display',Georgia,serif; font-style:italic; font-size:15px; color:#8E82F5; margin-top:0; line-height:1.4;">
        Your turning point in the AI Era.
      </div>
      <div style="font-size:13.5px; color:#B9B3E8; margin-top:11px; line-height:1.6; max-width:215px;">
        AI learning, built for the people doing the work.
      </div>
    </td>

    <td class="gap" width="4%" style="width:4%; font-size:0;">&nbsp;</td>

    <td class="stack-r" width="40%" valign="top" align="right" style="width:40%;">
      <div style="font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#8F87C9; padding-bottom:14px;">Follow us</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" class="al"><tr>
        <td style="padding:0 0 0 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="36" height="36" align="center" valign="middle" style="width:36px; height:36px; border:1px solid #453D80; border-radius:11px;">
              <a href="https://menler.in" title="Website" style="text-decoration:none;"><img src="https://img.icons8.com/ios-filled/100/B9B3E8/internet.png" width="17" height="17" alt="Website" style="width:17px; height:17px; display:inline-block; vertical-align:middle; border:0;" /></a>
            </td>
          </tr></table>
        </td>
        <td style="padding:0 0 0 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="36" height="36" align="center" valign="middle" style="width:36px; height:36px; border:1px solid #453D80; border-radius:11px;">
              <a href="https://www.linkedin.com/company/menler" title="LinkedIn" style="text-decoration:none;"><img src="https://img.icons8.com/ios-filled/100/B9B3E8/linkedin.png" width="17" height="17" alt="LinkedIn" style="width:17px; height:17px; display:inline-block; vertical-align:middle; border:0;" /></a>
            </td>
          </tr></table>
        </td>
        <td style="padding:0 0 0 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="36" height="36" align="center" valign="middle" style="width:36px; height:36px; border:1px solid #453D80; border-radius:11px;">
              <a href="https://www.instagram.com/menler.in/" title="Instagram" style="text-decoration:none;"><img src="https://img.icons8.com/ios-filled/100/B9B3E8/instagram-new.png" width="17" height="17" alt="Instagram" style="width:17px; height:17px; display:inline-block; vertical-align:middle; border:0;" /></a>
            </td>
          </tr></table>
        </td>
        <td style="padding:0 0 0 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="36" height="36" align="center" valign="middle" style="width:36px; height:36px; border:1px solid #453D80; border-radius:11px;">
              <a href="https://www.facebook.com/people/Menler/61589670181082/" title="Facebook" style="text-decoration:none;"><img src="https://img.icons8.com/ios-filled/100/B9B3E8/facebook-new.png" width="17" height="17" alt="Facebook" style="width:17px; height:17px; display:inline-block; vertical-align:middle; border:0;" /></a>
            </td>
          </tr></table>
        </td>
      </tr></table>
    </td>

  </tr></table>
</td></tr>`;

// One shell, several bodies. `body` is the paragraphs between "Dear …" and the
// button; `cta` the button label + href; `why` the permission-bar line;
// `closing` the line above the signature — "See you in class!" is a student's.
// `cta` is optional: a password-reset code has no button on purpose, and a
// mail that asks you to click nothing cannot train its readers to click.
// `help` is the "if this doesn't work, write to us" line above the sign-off;
// the default is the account mails' wording, a broadcast passes its own.
// `closing` may be '' — a broadcast's sign-off is whatever the admin typed.
function shell({ preview, greeting, body, cta = null, why, title, closing = 'See you in class!', help = DEFAULT_HELP }) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
  <style>
    body,table,td,a{ -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    img{ border:0; line-height:100%; outline:none; text-decoration:none; display:block; }
    table{ border-collapse:collapse !important; }
    a{ color:#534AB7; }
    @media only screen and (max-width:620px){
      .container{ width:100% !important; }
      .px{ padding-left:24px !important; padding-right:24px !important; }
      .stack{ display:block !important; width:100% !important; max-width:100% !important; text-align:left !important; }
      .stack-r{ display:block !important; width:100% !important; max-width:100% !important; text-align:left !important; padding-top:26px !important; }
      .gap{ display:none !important; }
      .fluid{ width:100% !important; height:auto !important; }
      .al{ float:none !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#FFFFFF; font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${esc(preview)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">
    <tr><td align="center" style="padding:0;">
      <table role="presentation" class="container" width="620" cellpadding="0" cellspacing="0" border="0" style="width:620px; max-width:620px; background:#ffffff;">

        <tr><td style="font-size:0; line-height:0;">
          <img src="${BANNER}" width="620" alt="Menler — Your turning point in the AI era."
               class="fluid" style="width:100%; max-width:620px; height:auto; display:block; border:0;" />
        </td></tr>

        <tr><td class="px" style="padding:40px 40px 0;">
          ${P(`Dear ${esc(greeting)},`, 0)}
          ${body}
        </td></tr>

        ${cta ? `<tr><td align="center" class="px" style="padding:30px 40px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
            <td bgcolor="#211B4C" style="border-radius:6px;">
              <a href="${esc(cta.href)}" style="display:inline-block; padding:15px 42px; font-family:'DM Sans',Arial,sans-serif; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:6px;">${esc(cta.label)}</a>
            </td>
          </tr></table>
        </td></tr>` : ''}

        <tr><td class="px" style="padding:32px 40px 44px;">
          ${P(help, 0)}
          ${closing ? P(esc(closing), 24) : ''}
          ${P('<strong style="font-weight:700;">Menler</strong><br />Your turning point in the AI era', 24)}
        </td></tr>

        ${FOOTER}

        <tr><td height="3" bgcolor="#534AB7" style="height:3px; background-color:#534AB7; font-size:0; line-height:0;">&nbsp;</td></tr>

        <tr><td bgcolor="#1B1640" align="center" class="px" style="background-color:#1B1640; padding:22px 40px 24px;">
          <div style="font-size:13px; line-height:1.6; color:#8F87C9;">${why}</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// The credentials box. Monospace for the password because l/1 and O/0 are
// exactly the kind of thing a phone read-out gets wrong.
function credentials(email, password) {
  const row = (k, v) => `<tr>
    <td style="padding:10px 16px; font-size:13px; color:#6B6F80; white-space:nowrap; border-top:1px solid #E6E4F2;">${k}</td>
    <td style="padding:10px 16px; font-size:15px; color:#1F2430; border-top:1px solid #E6E4F2; font-family:Consolas,Menlo,monospace;">${v}</td>
  </tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px; background:#F6F5FB; border:1px solid #E6E4F2; border-radius:8px;">
    <tr><td colspan="2" style="padding:12px 16px 4px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#534AB7;">Your sign-in</td></tr>
    ${row('Email', esc(email))}
    ${row('Password', esc(password))}
  </table>`;
}

const ROLE_LINE = {
  student: 'This is where your sessions, recordings, assignments, quizzes and certificate live.',
  mentor: 'This is where you run your batches — sessions, attendance, grading and doubts.',
  admin: 'This is the admin console for the whole LMS.',
};

const SIGN_OFF = 'Menler — Your turning point in the AI era';

const CLOSING = { student: 'See you in class!', mentor: 'Glad to have you on board!', admin: 'Welcome aboard!' };
const closingFor = (role) => CLOSING[role] || CLOSING.student;

const TEMP_NOTE = 'This is a temporary password. The first time you sign in you will be asked to choose your own — please do that straight away, and do not forward this email.';

// An admin just created the account. `programme` is optional — set when the
// account was made by enrolling into a batch, so the mail can say which.
export function accountCreatedEmail({ fullName, email, password, role = 'student', loginUrl, programme }) {
  const first = firstNameOf(fullName, email);
  const subject = programme ? `Your Menler login — ${programme}` : 'Your Menler LMS login';
  const roleLine = ROLE_LINE[role] || ROLE_LINE.student;
  const opener = programme
    ? `Welcome to ${programme}. Your Menler LMS account is ready.`
    : 'Your Menler LMS account is ready.';
  // The prerequisites folder is the student course pack — an admin account
  // made through this path has no use for it.
  const isStudent = role === 'student';

  const html = shell({
    title: subject,
    preview: 'Your account is ready — here is how to sign in.',
    greeting: first,
    body: [
      P(programme ? `Welcome to <strong>${esc(programme)}</strong>. Your Menler LMS account is ready.` : opener),
      P(roleLine),
      credentials(email, password),
      P(TEMP_NOTE),
      // Linked words, not the bare URL: the Drive link is long enough to wrap
      // badly in a 620px column. The plain-text part spells it out in full.
      isStudent ? P(`Before your first session, please go through the <a href="${PREREQUISITES_URL}" style="color:#534AB7; text-decoration:underline;">prerequisites folder</a>.`) : '',
      P('Sign in through the link below:'),
    ].filter(Boolean).join('\n'),
    cta: { label: 'Sign in', href: loginUrl },
    why: `You're receiving this because a Menler account was created for ${esc(email)}. If that wasn't you, write to ${mailtoLink('#8E82F5')}.`,
    closing: closingFor(role),
  });

  const text = [
    `Dear ${first},`, '',
    opener, roleLine, '',
    `Email:    ${email}`,
    `Password: ${password}`, '',
    TEMP_NOTE, '',
    ...(isStudent ? [`Prerequisites: ${PREREQUISITES_URL}`, ''] : []),
    `Sign in: ${loginUrl}`, '',
    `If anything about signing in does not work, write to ${SUPPORT_EMAIL}.`, '',
    closingFor(role), '',
    SIGN_OFF,
  ].join('\n');

  return { subject, text, html };
}

// A mentor's welcome. Not the student mail with the role line swapped: a
// mentor has no course pack to read and no class to attend — they run one.
// `batches` is the batch names they are assigned to right now; an admin
// usually creates the account first and assigns later, which is why the
// "Send login email" button exists — resent after assigning, it names them.
export function mentorWelcomeEmail({ fullName, email, password, loginUrl, batches = [] }) {
  const first = firstNameOf(fullName, email);
  const subject = 'Welcome to the Menler mentor team — your LMS login';
  const opener = 'Welcome to the Menler mentor team. Your mentor account on the Menler LMS is ready.';
  const duties = 'You’ll guide our learners through the programme — running sessions, reviewing their work and helping them whenever they get stuck.';
  const names = batches.filter(Boolean);
  const assignedText = names.length
    ? `You are assigned to: ${names.join(', ')}.`
    : 'You are not assigned to a batch yet — once the team assigns you one, it appears on your dashboard.';
  const assignedHtml = names.length
    ? `You are assigned to ${names.map((n) => `<strong>${esc(n)}</strong>`).join(', ')}.`
    : esc(assignedText);

  const html = shell({
    title: subject,
    preview: 'Your mentor account is ready — here is how to sign in.',
    greeting: first,
    body: [
      P(esc(opener)),
      P(esc(duties)),
      P(assignedHtml),
      credentials(email, password),
      P(TEMP_NOTE),
      P('Sign in through the link below:'),
    ].join('\n'),
    cta: { label: 'Open mentor dashboard', href: loginUrl },
    why: `You're receiving this because a Menler mentor account was created for ${esc(email)}. If that wasn't you, write to ${mailtoLink('#8E82F5')}.`,
    closing: closingFor('mentor'),
  });

  const text = [
    `Dear ${first},`, '',
    opener, '',
    duties, '',
    assignedText, '',
    `Email:    ${email}`,
    `Password: ${password}`, '',
    TEMP_NOTE, '',
    `Sign in: ${loginUrl}`, '',
    `If anything about signing in does not work, write to ${SUPPORT_EMAIL}.`, '',
    closingFor('mentor'), '',
    SIGN_OFF,
  ].join('\n');

  return { subject, text, html };
}

// An admin reset the password. Same shell, shorter body.
export function passwordResetByAdminEmail({ fullName, email, password, loginUrl, role = 'student' }) {
  const first = firstNameOf(fullName, email);
  const subject = 'Your Menler LMS password was reset';
  const opener = 'Your Menler LMS password has been reset by the team. Any device that was signed in has been signed out.';
  const tempNote = 'This is a temporary password. You will be asked to choose your own the next time you sign in.';

  const html = shell({
    title: subject,
    preview: 'A new temporary password — sign in and choose your own.',
    greeting: first,
    body: [P(opener), credentials(email, password), P(tempNote), P('Sign in through the link below:')].join('\n'),
    cta: { label: 'Sign in', href: loginUrl },
    why: `You're receiving this because the password for ${esc(email)} was reset. If you didn't ask for this, write to ${mailtoLink('#8E82F5')}.`,
    closing: closingFor(role),
  });

  const text = [
    `Dear ${first},`, '',
    opener, '',
    `Email:    ${email}`,
    `Password: ${password}`, '',
    tempNote, '',
    `Sign in: ${loginUrl}`, '',
    `If anything about signing in does not work, write to ${SUPPORT_EMAIL}.`, '',
    SIGN_OFF,
  ].join('\n');

  return { subject, text, html };
}

// A one-time code for resetting a forgotten password.
//
// The code is the whole message, so it is set large and monospaced and given
// its own block — most people read it off a phone notification and type it
// into another window, and a six-digit number buried in a paragraph is the
// version of this that gets misread.
//
// No link and no button on purpose: a password-reset mail is the single most
// impersonated email there is, and one that never asks you to click anything
// cannot teach its readers to click. The code is typed into the tab they
// already have open.
export function passwordOtpEmail({ fullName, email, code, minutes = 10 }) {
  const first = firstNameOf(fullName, email);
  const subject = `${code} is your Menler password reset code`;
  const opener = 'Someone asked to reset the password for your Menler LMS account. Enter this code in the tab you started from:';

  const codeBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px; background:#F6F5FB; border:1px solid #E6E4F2; border-radius:8px;">
    <tr><td align="center" style="padding:22px 16px 6px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#534AB7;">Your reset code</td></tr>
    <tr><td align="center" style="padding:0 16px 22px; font-size:34px; font-weight:700; letter-spacing:.22em; color:#1F2430; font-family:Consolas,Menlo,monospace;">${esc(code)}</td></tr>
  </table>`;

  const html = shell({
    title: subject,
    preview: `${code} — expires in ${minutes} minutes.`,
    greeting: first,
    body: [
      P(opener),
      codeBlock,
      P(`The code expires in ${minutes} minutes and can be used once.`),
      P('If you did not ask for this, you can ignore this email — your password stays as it is. Nobody can change it without the code above.'),
    ].join('\n'),
    why: `You're receiving this because a password reset was requested for ${esc(email)}. If that wasn't you, write to ${mailtoLink('#8E82F5')}.`,
    closing: 'See you in class!',
  });

  const text = [
    `Dear ${first},`, '',
    opener, '',
    `    ${code}`, '',
    `The code expires in ${minutes} minutes and can be used once.`, '',
    'If you did not ask for this, you can ignore this email — your password stays as it is.', '',
    `Questions? Write to ${SUPPORT_EMAIL}.`, '',
    SIGN_OFF,
  ].join('\n');

  return { subject, text, html };
}

// ── Admin broadcasts ────────────────────────────────────────────────────────
//
// A mail the admin wrote on the Mail tab and scheduled for a batch. The admin
// owns the subject and the body; the banner, the greeting, the help line, the
// signature and the footer are the shell's, so every campaign reads as the
// same company as the account mails. `body` arrives as plain text with the
// placeholders already filled (see utils/mailCampaigns.js).
//
// Text → HTML: blank lines split paragraphs, a single newline is a <br>, a
// bare URL becomes a link, and everything else is escaped. No markup is
// honoured on purpose — an admin pasting from a doc is how a mail ships with
// half a table in it.
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/g;

function paragraphHtml(text) {
  const lines = String(text || '').split('\n').map((line) => {
    let out = '';
    let last = 0;
    for (const m of line.matchAll(URL_RE)) {
      // Trailing punctuation is prose, not part of the address.
      const raw = m[0];
      const trimmed = raw.replace(/[.,;:!?]+$/, '');
      out += esc(line.slice(last, m.index));
      out += `<a href="${esc(trimmed)}" style="color:#534AB7; text-decoration:underline; word-break:break-all;">${esc(trimmed)}</a>${esc(raw.slice(trimmed.length))}`;
      last = m.index + raw.length;
    }
    return out + esc(line.slice(last));
  });
  return lines.join('<br />');
}

// The certificate mail. Unlike the account mails this one carries nothing
// secret — the whole point of a credential is that it can be shown to a
// stranger — so it is safe to forward, and the copy says so rather than
// warning against it the way the password mails do.
//
// Two ways in, deliberately. The button opens the certificate on the site; the
// code is also spelled out in plain text, because a certificate gets printed,
// photographed and pasted into an application form, and a verifier holding
// only the picture needs something they can type.
export function certificateEmail({ fullName, email, programme, batchName, code, verifyUrl, sample = false }) {
  // Where the printable certificate itself lives, behind their login.
  const certificatesUrl = appUrl('/app/profile');
  const first = firstNameOf(fullName, email);
  /* A sample says so in the subject. These go to a team inbox that also
     receives the real thing, and the two must not be told apart only by
     reading the body. */
  const subject = sample ? `[Sample] ${programme} certificate` : `Your ${programme} certificate`;
  /* Batches are named after their programme — "Kickstarter · Sept 2026" — so
     prefixing the programme onto the batch produced "Kickstarter · Kickstarter
     · Sept 2026". Use the batch name alone when it already carries the
     programme, and only compose the two when it does not. */
  const where = !batchName
    ? programme
    : batchName.toLowerCase().includes(programme.toLowerCase())
      ? batchName
      : `${programme} · ${batchName}`;

  const row = (k, v) => `<tr>
    <td style="padding:10px 16px; font-size:13px; color:#6B6F80; white-space:nowrap; border-top:1px solid #E6E4F2;">${k}</td>
    <td style="padding:10px 16px; font-size:15px; color:#1F2430; border-top:1px solid #E6E4F2; font-family:Consolas,Menlo,monospace;">${v}</td>
  </tr>`;
  const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px; background:#F6F5FB; border:1px solid #E6E4F2; border-radius:8px;">
    <tr><td colspan="2" style="padding:12px 16px 4px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#534AB7;">Your certificate</td></tr>
    ${row('Name', esc(fullName || email))}
    ${row('Programme', esc(where))}
    ${row('Certificate ID', esc(code))}
  </table>`;

  const html = shell({
    title: subject,
    preview: `Your ${programme} certificate is ready.`,
    greeting: first,
    body: [
      /* Said before anything else, because someone skimming a sample in a
         shared inbox should not have to reach the footer to learn it is one.
         The id ends 0000, which no issued certificate ever can. */
      sample ? P(`<strong>This is a sample.</strong> It was sent to check how the certificate email looks. The certificate ID below ends 0000, which no real certificate does, and it will not verify.`, 0) : '',
      P(`Congratulations — you have completed <strong>${esc(where)}</strong>, and your certificate is ready.`),
      details,
      P('Sign in to open it, download it, or print it.'),
      /* The certificate is released to the student when this mail goes, so
         this is the first moment they can open it — which makes "where do I
         find it" the question the mail has to answer first. The public check
         comes second: that is what they forward to somebody else, not what
         they do next. */
      P(`Anyone you show it to can confirm it is genuine — by scanning the QR code printed on it, or at <a href="${verifyUrl}" style="color:#534AB7; text-decoration:underline;">this link</a>. They see your name, the programme and the date it was issued, and nothing else.`),
    ].filter(Boolean).join('\n'),
    cta: { label: 'Open your certificate', href: certificatesUrl },
    /* shell()'s default help line is about signing in, which is right for the
       account mails and meaningless here — nobody is being asked to log in. */
    help: `Questions about your certificate? Write to ${mailtoLink()}.`,
    why: `You're receiving this because you completed a Menler programme as ${esc(email)}. Questions? Write to ${mailtoLink('#8E82F5')}.`,
    closing: 'Well done!',
  });

  const text = [
    `Dear ${first},`, '',
    ...(sample ? ['This is a sample, sent to check how the certificate email looks.', 'The certificate ID below ends 0000, which no real certificate does, and it', 'will not verify.', ''] : []),
    `Congratulations - you have completed ${where}, and your certificate is ready.`, '',
    `Name:           ${fullName || email}`,
    `Programme:      ${where}`,
    `Certificate ID: ${code}`, '',
    'Sign in to open it, download it, or print it:', '',
    certificatesUrl, '',
    'Anyone you show it to can confirm it is genuine by scanning the QR code',
    'printed on it, or at this link:', '',
    verifyUrl, '',
    `Questions? Write to ${SUPPORT_EMAIL}.`, '',
    'Well done!', '',
    SIGN_OFF,
  ].join('\n');

  return { subject, text, html };
}

export function bodyToHtml(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => P(paragraphHtml(para)))
    .join('\n');
}

export function broadcastEmail({ fullName, email, subject, body, batchName = '' }) {
  const first = firstNameOf(fullName, email);
  const where = batchName ? ` in ${esc(batchName)}` : '';

  const html = shell({
    title: subject,
    preview: String(body || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    greeting: first,
    body: bodyToHtml(body),
    help: `Questions? Write to ${mailtoLink()}.`,
    closing: '',
    why: `You're receiving this because you are enrolled${where} on the Menler LMS, as ${esc(email)}.`,
  });

  const text = [
    `Dear ${first},`, '',
    String(body || '').replace(/\r\n?/g, '\n').trim(), '',
    `Questions? Write to ${SUPPORT_EMAIL}.`, '',
    SIGN_OFF,
  ].join('\n');

  return { subject, text, html };
}
