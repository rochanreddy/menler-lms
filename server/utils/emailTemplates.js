// The account emails, laid out on the same shell as
// docs/email-reference-enrollment-confirmation.html — banner, button, logo
// footer and permission bar, so an LMS login mail reads as the same company.
// The body copy is different: that template confirms a seat, these hand over
// a sign-in.
//
// Images are hot-linked from menler.in (public/email-banner.jpg,
// public/email-logo.png) — same as the marketing mailers.

// Where the button points. Same env the password-reset link is built from.
export const loginUrl = () => `${(process.env.LMS_APP_URL || 'http://localhost:5174').replace(/\/+$/, '')}/login`;

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

// PLACEHOLDER — swap for the real prerequisites page before the next cohort.
const PREREQUISITES_URL = 'https://menler.in/prerequisites';

// The permission bar sits on #1B1640, so a link there needs the light violet;
// the global `a{color:#534AB7}` would be near-invisible against it.
const mailtoLink = (color = '#534AB7') =>
  `<a href="mailto:${SUPPORT_EMAIL}" style="color:${color}; text-decoration:underline;">${SUPPORT_EMAIL}</a>`;

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

// One shell, two bodies. `body` is the paragraphs between "Dear …" and the
// button; `cta` the button label + href; `why` the permission-bar line.
function shell({ preview, greeting, body, cta, why, title }) {
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

        <tr><td align="center" class="px" style="padding:30px 40px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
            <td bgcolor="#211B4C" style="border-radius:6px;">
              <a href="${esc(cta.href)}" style="display:inline-block; padding:15px 42px; font-family:'DM Sans',Arial,sans-serif; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:6px;">${esc(cta.label)}</a>
            </td>
          </tr></table>
        </td></tr>

        <tr><td class="px" style="padding:32px 40px 44px;">
          ${P(`If anything about signing in does not work, write to ${mailtoLink()}.`, 0)}
          ${P('See you in class!', 24)}
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

// An admin just created the account. `programme` is optional — set when the
// account was made by enrolling into a batch, so the mail can say which.
export function accountCreatedEmail({ fullName, email, password, role = 'student', loginUrl, programme }) {
  const first = firstNameOf(fullName, email);
  const subject = programme ? `Your Menler login — ${programme}` : 'Your Menler LMS login';
  const roleLine = ROLE_LINE[role] || ROLE_LINE.student;
  const opener = programme
    ? `Welcome to ${programme}. Your Menler LMS account is ready.`
    : 'Your Menler LMS account is ready.';
  const tempNote = 'This is a temporary password. The first time you sign in you will be asked to choose your own — please do that straight away, and do not forward this email.';

  const html = shell({
    title: subject,
    preview: 'Your account is ready — here is how to sign in.',
    greeting: first,
    body: [
      P(programme ? `Welcome to <strong>${esc(programme)}</strong>. Your Menler LMS account is ready.` : opener),
      P(roleLine),
      credentials(email, password),
      P(tempNote),
      P(`Before your first session, please go through the prerequisites: <a href="${PREREQUISITES_URL}" style="color:#534AB7; text-decoration:underline;">${PREREQUISITES_URL}</a>`),
      P('Sign in through the link below:'),
    ].join('\n'),
    cta: { label: 'Sign in', href: loginUrl },
    why: `You're receiving this because a Menler account was created for ${esc(email)}. If that wasn't you, write to ${mailtoLink('#8E82F5')}.`,
  });

  const text = [
    `Dear ${first},`, '',
    opener, roleLine, '',
    `Email:    ${email}`,
    `Password: ${password}`, '',
    tempNote, '',
    `Prerequisites: ${PREREQUISITES_URL}`, '',
    `Sign in: ${loginUrl}`, '',
    `If anything about signing in does not work, write to ${SUPPORT_EMAIL}.`, '',
    SIGN_OFF,
  ].join('\n');

  return { subject, text, html };
}

// An admin reset the password. Same shell, shorter body.
export function passwordResetByAdminEmail({ fullName, email, password, loginUrl }) {
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
