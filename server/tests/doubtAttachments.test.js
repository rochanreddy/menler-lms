// The two rules behind doubt-session attachments that fail QUIETLY.
// Needs no database: both are pure functions over bytes and a clock.
//
//   node --test tests/doubtAttachments.test.js
//
// The sniff is what stands between "attach a screenshot" and a student handing
// the admin a renamed executable to click on; the browser's declared type is
// worth nothing here, so only the bytes are consulted.
//
// The expiry is the promise printed on the upload box. Too eager and it takes
// the screenshot off the mentor's screen during the call it was attached for;
// too lax and files a student was told would be deleted sit in Mongo for the
// rest of the course. Neither throws, so neither shows up anywhere.

import test from 'node:test';
import assert from 'node:assert/strict';

import { sniffAttachment } from '../utils/doubtAttachments.js';
import { attachmentsExpired, SWEEP_GRACE_MS } from '../utils/doubtAttachmentSweep.js';

const file = (bytes) => ({ buffer: Buffer.from(bytes) });
const pad = (head, n = 32) => [...head, ...Array(n).fill(0)];

const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const GIF = pad([...Buffer.from('GIF89a')]);
const PDF = pad([...Buffer.from('%PDF-1.7')]);

test('the formats a student actually attaches are read from their bytes', () => {
  assert.equal(sniffAttachment(file(PNG)), 'image/png');
  assert.equal(sniffAttachment(file(JPEG)), 'image/jpeg');
  assert.equal(sniffAttachment(file(GIF)), 'image/gif');
  assert.equal(sniffAttachment(file(PDF)), 'application/pdf');

  const webp = Buffer.alloc(32);
  webp.write('RIFF', 0, 'latin1');
  webp.write('WEBP', 8, 'latin1');
  assert.equal(sniffAttachment({ buffer: webp }), 'image/webp');
});

test('the declared type decides nothing — a renamed file is still refused', () => {
  const exe = { buffer: Buffer.from(pad([0x4d, 0x5a])), originalname: 'screenshot.png', mimetype: 'image/png' };
  assert.equal(sniffAttachment(exe), null, 'MZ bytes called a PNG must not pass');

  const zip = { buffer: Buffer.from(pad([0x50, 0x4b, 0x03, 0x04])), originalname: 'notes.pdf', mimetype: 'application/pdf' };
  assert.equal(sniffAttachment(zip), null, 'a zip called a PDF must not pass');

  assert.equal(sniffAttachment({ buffer: Buffer.alloc(0) }), null, 'an empty file is nothing');
  assert.equal(sniffAttachment({}), null, 'a file with no bytes is nothing');
});

// A 7:00–10:00 evening in 30-minute slots: the last slot starts at 9:30 and the
// session is over at 10:00.
const evening = {
  slotsAt: [Date.parse('2026-09-24T19:00:00+05:30'), Date.parse('2026-09-24T21:30:00+05:30')].map((t) => new Date(t)),
  slotMinutes: 30,
};
const ENDS = Date.parse('2026-09-24T22:00:00+05:30');

test('attachments survive the whole evening, and the overrun after it', () => {
  assert.equal(attachmentsExpired(evening, ENDS - 60 * 60 * 1000), false, 'an hour before the end');
  assert.equal(attachmentsExpired(evening, ENDS), false, 'the minute the last slot finishes');
  // The case the grace exists for: a session that runs twenty minutes over is a
  // normal evening, and the mentor is still looking at the screenshot.
  assert.equal(attachmentsExpired(evening, ENDS + 20 * 60 * 1000), false, 'twenty minutes over');
  assert.equal(attachmentsExpired(evening, ENDS + SWEEP_GRACE_MS - 1), false, 'a millisecond short of the grace');
});

test('and are gone once the grace is up', () => {
  assert.equal(attachmentsExpired(evening, ENDS + SWEEP_GRACE_MS), true, 'exactly at the grace');
  assert.equal(attachmentsExpired(evening, ENDS + 24 * 60 * 60 * 1000), true, 'the next day');
});

test('a booking whose session is gone takes its files with it', () => {
  assert.equal(attachmentsExpired(null, Date.now()), true);
  assert.equal(attachmentsExpired(undefined, Date.now()), true);
});

test('a session with no slots has no end to measure, so nothing is guessed', () => {
  // Left alone rather than swept: there is no evening to be "after".
  assert.equal(attachmentsExpired({ slotsAt: [], slotMinutes: 30 }, Date.now()), false);
});

test('the slot length is part of the end, not just the last start', () => {
  const long = { slotsAt: [new Date(Date.parse('2026-09-24T21:30:00+05:30'))], slotMinutes: 60 };
  const endsLater = Date.parse('2026-09-24T22:30:00+05:30');
  assert.equal(attachmentsExpired(long, endsLater + SWEEP_GRACE_MS - 1), false);
  assert.equal(attachmentsExpired(long, endsLater + SWEEP_GRACE_MS), true);
});
