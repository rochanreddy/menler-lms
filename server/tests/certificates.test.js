// Certificates, end to end: issue, verify, revoke.
//
// Runs against a LOCAL throwaway database and refuses to start against
// anything else — this file writes, and a remote URI here would write to real
// students.
//
//   node --test tests/certificates.test.js
//
// Needs a mongod on 127.0.0.1. Override with LOCAL_TEST_MONGODB_URI, which
// must still be a localhost URI ending in _test.

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { Program } from '../models/Program.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { Certificate } from '../models/Certificate.js';
import { issueCertificate, monthStamp, nextCode, publicView, qrDataUri, segmentFor, verifyUrl } from '../utils/certificates.js';
import { Counter } from '../models/Counter.js';
import { certificateEmail } from '../utils/emailTemplates.js';

const URI = process.env.LOCAL_TEST_MONGODB_URI
  || 'mongodb://127.0.0.1:27017/menler_lms_certificates_test';

if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URI) || !/_test(\?|$)/.test(URI)) {
  throw new Error(`Refusing to run: ${URI} is not a local _test database.`);
}

process.env.LMS_APP_URL = 'https://lms.menler.in,https://menler-lms.vercel.app';

let program;
let batch;
let students;

test('setup', async () => {
  await mongoose.connect(URI);
  await Promise.all([
    Certificate.deleteMany({}), Program.deleteMany({}), Batch.deleteMany({}), User.deleteMany({}),
    Counter.deleteMany({}),
  ]);
  await Certificate.syncIndexes();

  program = await Program.create({ title: 'Kickstarter', type: 'cohort', published: true });
  students = await User.create([
    { email: 'asha@test.in', fullName: 'Asha Raman', role: 'student', passwordHash: 'x' },
    { email: 'dev@test.in', fullName: 'Dev Nair', role: 'student', passwordHash: 'x' },
  ]);
  batch = await Batch.create({
    programId: program._id,
    name: 'Kickstarter · Sept 2026',
    studentIds: students.map((s) => s._id),
    status: 'ongoing',
  });
});

test('a programme maps to its own segment', () => {
  assert.equal(segmentFor({ title: 'Generalist' }), 'AGFEL');
  assert.equal(segmentFor({ title: 'AI Generalist' }), 'AGFEL');
  assert.equal(segmentFor({ title: 'Kickstarter' }), 'AKFEL');
  assert.equal(segmentFor({ title: 'AI Kickstarter' }), 'AKFEL');
  // An unknown programme is still issuable rather than an error.
  assert.match(segmentFor({ title: 'Prompt Engineering' }), /^[A-Z]{2}FEL$/);
  // And a programme carrying its own code overrides the table.
  assert.equal(segmentFor({ title: 'anything', certCode: 'zzfel' }), 'ZZFEL');
});

test('the month stamp is MMYY of the issue date', () => {
  assert.equal(monthStamp(new Date(2026, 8, 14)), '0926');  // September
  assert.equal(monthStamp(new Date(2026, 10, 3)), '1126');  // November
  assert.equal(monthStamp(new Date(2027, 0, 1)), '0127');   // January, year rolls
});

test('codes run in sequence, per programme and per month', async () => {
  const gen = await Program.create({ title: 'Generalist', type: 'cohort', published: true });
  const sep = new Date(2026, 8, 20);

  const a = await nextCode(program, sep);   // Kickstarter
  const b = await nextCode(program, sep);
  const c = await nextCode(gen, sep);       // Generalist — its own run
  const d = await nextCode(program, new Date(2026, 9, 1)); // October — restarts

  assert.equal(a, 'MNLR-AKFEL-0926-0001');
  assert.equal(b, 'MNLR-AKFEL-0926-0002');
  assert.equal(c, 'MNLR-AGFEL-0926-0001', 'the two programmes share a counter');
  assert.equal(d, 'MNLR-AKFEL-1026-0001', 'the month did not restart the run');

  await Program.deleteOne({ _id: gen._id });
  await Counter.deleteMany({});
});

test('numbers do not collide when issued at the same moment', async () => {
  const when = new Date(2026, 11, 1);
  // Fifty at once through the same counter: if the increment were a read then
  // a write, this is where two of them would come back the same.
  const codes = await Promise.all(Array.from({ length: 50 }, () => nextCode(program, when)));
  assert.equal(new Set(codes).size, 50, 'two concurrent issues got the same number');

  const numbers = codes.map((c) => Number(c.slice(-4))).sort((x, y) => x - y);
  assert.deepEqual(numbers, Array.from({ length: 50 }, (_, i) => i + 1), 'the run has gaps or repeats');
  await Counter.deleteMany({});
});

test('issuing snapshots the name, programme and batch', async () => {
  const { cert, created } = await issueCertificate({ student: students[0], program, batch });
  assert.equal(created, true);
  assert.equal(cert.studentName, 'Asha Raman');
  assert.equal(cert.programTitle, 'Kickstarter');
  assert.equal(cert.batchName, 'Kickstarter · Sept 2026');
  assert.match(cert.code, /^MNLR-AKFEL-\d{4}-\d{4}$/);
});

test('issuing twice returns the same certificate, not a second code', async () => {
  const first = await Certificate.findOne({ studentId: students[0]._id });
  const { cert, created } = await issueCertificate({ student: students[0], program, batch });
  assert.equal(created, false, 're-issuing minted a new certificate');
  assert.equal(cert.code, first.code);
  assert.equal(await Certificate.countDocuments({ studentId: students[0]._id }), 1);
});

test('a renamed student does not rewrite a certificate already issued', async () => {
  const before = await Certificate.findOne({ studentId: students[0]._id });
  await User.findByIdAndUpdate(students[0]._id, { fullName: 'Asha R. Raman' });
  const reread = await Certificate.findOne({ studentId: students[0]._id });
  assert.equal(reread.studentName, before.studentName, 'the snapshot followed the profile');
  assert.equal(reread.studentName, 'Asha Raman');
});

test('the public view exposes only what verifying needs', async () => {
  const cert = await Certificate.findOne({ studentId: students[0]._id });
  const view = publicView(cert);
  assert.deepEqual(
    Object.keys(view).sort(),
    ['batch', 'code', 'issuedAt', 'name', 'programme', 'revoked', 'revokedAt', 'valid'],
  );
  // The things a verifier has no business receiving.
  const serialized = JSON.stringify(view);
  for (const leak of [String(cert.studentId), String(cert._id), 'asha@test.in', 'passwordHash']) {
    assert.ok(!serialized.includes(leak), `public view leaked ${leak}`);
  }
  assert.equal(view.valid, true);
});

test('the QR encodes the verification URL on the real origin', async () => {
  const cert = await Certificate.findOne({ studentId: students[0]._id });
  const url = verifyUrl(cert.code);
  // The comma-separated LMS_APP_URL must not end up inside the host.
  assert.equal(new URL(url).host, 'lms.menler.in');
  assert.ok(url.endsWith(`/verify/${cert.code}`));

  const uri = await qrDataUri(cert.code);
  assert.ok(uri.startsWith('data:image/svg+xml;base64,'));
  const svg = Buffer.from(uri.split(',')[1], 'base64').toString();
  assert.match(svg, /^<svg/);
  assert.ok(svg.length > 500, 'QR SVG is implausibly small');
});

test('revoking keeps the certificate resolvable and says so', async () => {
  const cert = await Certificate.findOne({ studentId: students[1]._id })
    || (await issueCertificate({ student: students[1], program, batch })).cert;
  cert.revokedAt = new Date();
  cert.revokedReason = 'Issued in error';
  await cert.save();

  const view = publicView(await Certificate.findById(cert._id));
  assert.equal(view.valid, false);
  assert.equal(view.revoked, true);
  assert.equal(view.name, 'Dev Nair', 'a revoked certificate still names its holder');
  assert.ok(!JSON.stringify(view).includes('Issued in error'), 'the internal reason went public');
});

test('the mail carries the code and no secret', async () => {
  const cert = await Certificate.findOne({ studentId: students[0]._id });
  const mail = certificateEmail({
    fullName: cert.studentName,
    email: 'asha@test.in',
    programme: cert.programTitle,
    batchName: cert.batchName,
    code: cert.code,
    verifyUrl: verifyUrl(cert.code),
  });
  assert.ok(mail.text.includes(cert.code));
  assert.ok(mail.html.includes(cert.code));
  assert.ok(!/password/i.test(mail.text), 'the certificate mail mentions a password');
  for (const [, href] of mail.html.matchAll(/href="([^"]+)"/g)) {
    if (href.startsWith('mailto:')) continue;
    assert.doesNotThrow(() => new URL(href), `unparseable link in the mail: ${href}`);
  }
});

test('teardown', async () => {
  await Promise.all([
    Certificate.deleteMany({}), Program.deleteMany({}), Batch.deleteMany({}), User.deleteMany({}),
    Counter.deleteMany({}),
  ]);
  await mongoose.disconnect();
});
