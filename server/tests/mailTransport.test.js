// Which transport each kind of mail goes out on (transportFor in
// utils/email.js). No network: only the choice is tested, never a send.
//
// The rule: the automatic reminders go out on ZeptoMail, and everything a
// person sends or triggers - the admin's Mail tab, credentials, password
// resets - goes out on Resend. It exists because ZeptoMail used to be first
// for everything, so when its sender was unverified the whole admin Mail tab
// failed while Resend sat configured behind it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { transportFor } from '../utils/email.js';

const KEYS = ['ZEPTOMAIL_TOKEN', 'RESEND_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

/** Runs `fn` with exactly these mail variables set, then restores the rest. */
function withEnv(vars, fn) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const SMTP = { SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASS: 'p' };

test('with both set, admin mail goes on Resend and reminders on ZeptoMail', () => {
  withEnv({ ZEPTOMAIL_TOKEN: 'z', RESEND_API_KEY: 'r' }, () => {
    assert.equal(transportFor(), 'resend', 'the admin Mail tab, credentials and resets');
    assert.equal(transportFor('zeptomail'), 'zeptomail', 'the class and assignment reminders');
  });
});

test('admin mail never reaches ZeptoMail while Resend or SMTP is set', () => {
  withEnv({ ZEPTOMAIL_TOKEN: 'z', ...SMTP }, () => {
    assert.equal(transportFor(), 'smtp');
  });
});

test('ZeptoMail is the last resort for admin mail, not a dead end', () => {
  // With nothing else configured, sending on the reminder account beats
  // dropping the mail into the console on a live server.
  withEnv({ ZEPTOMAIL_TOKEN: 'z' }, () => {
    assert.equal(transportFor(), 'zeptomail');
  });
});

test('reminders fall back to Resend when ZeptoMail is not set', () => {
  // sessionReminders still refuses to mail a cohort over Resend unless
  // REMINDERS_ALLOW_RESEND=1; this is only the transport it would get.
  withEnv({ RESEND_API_KEY: 'r' }, () => {
    assert.equal(transportFor('zeptomail'), 'resend');
  });
});

test('nothing configured means the console, for every kind of mail', () => {
  withEnv({}, () => {
    assert.equal(transportFor(), null);
    assert.equal(transportFor('zeptomail'), null);
  });
});

test('an unknown route is treated as the default, not as ZeptoMail', () => {
  withEnv({ ZEPTOMAIL_TOKEN: 'z', RESEND_API_KEY: 'r' }, () => {
    assert.equal(transportFor('resend'), 'resend');
    assert.equal(transportFor('nonsense'), 'resend');
  });
});
