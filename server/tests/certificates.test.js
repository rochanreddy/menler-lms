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
import { issueCertificate, monthFromName, monthStamp, nextCode, publicView, qrDataUri, segmentFor, signingRole, stampDateFor, studentCanSee, verifyUrl } from '../utils/certificates.js';
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

test('the month comes from the batch, not the day it was issued', () => {
  // A cohort that ran in September keeps September codes even when the
  // certificates go out in November. This is the whole point of the stamp:
  // one intake, one number series.
  const november = new Date(2026, 10, 14);

  assert.equal(monthStamp(stampDateFor({ startDate: new Date(2026, 8, 4) }, november)), '0926',
    'startDate did not win');
  assert.equal(monthStamp(stampDateFor({ name: 'Kickstarter · Sept 2026' }, november)), '0926',
    'the month written in the name was not read');
  assert.equal(monthStamp(stampDateFor({ startDate: new Date(2026, 2, 4), name: 'Kickstarter · Sept 2026' }, november)), '0326',
    'the name overrode an explicit startDate');
  // Only when the batch says nothing at all does the issue date get used.
  assert.equal(monthStamp(stampDateFor({ name: 'Autumn cohort' }, november)), '1126');
  assert.equal(monthStamp(stampDateFor(null, november)), '1126');
});

test('a batch name is read in whatever way it happens to be punctuated', () => {
  const cases = [
    ['Kickstarter · Sept 2026', '0926'],
    ['Demo: Kickstarter · Jun 2026', '0626'],
    ['Generalist — November 2026', '1126'],
    ['AI Kickstarter Jan 2027', '0127'],
    ['Generalist, May 2026', '0526'],
  ];
  for (const [name, want] of cases) {
    assert.equal(monthStamp(monthFromName(name)), want, name);
  }
  for (const junk of ['Autumn cohort', 'Batch 3', '', null, 'Kickstarter 1999', 'March']) {
    assert.equal(monthFromName(junk), null, String(junk));
  }
});

test('codes run in sequence, per programme and per batch month', async () => {
  const gen = await Program.create({ title: 'Generalist', type: 'cohort', published: true });
  const sep = { name: 'Kickstarter · Sept 2026' };
  const oct = { name: 'Kickstarter · Oct 2026' };

  const a = await nextCode(program, sep);   // Kickstarter
  const b = await nextCode(program, sep);
  const c = await nextCode(gen, sep);       // Generalist — its own run
  const d = await nextCode(program, oct);   // a different intake — restarts

  assert.equal(a, 'MNLR-AKFEL-0926-0001');
  assert.equal(b, 'MNLR-AKFEL-0926-0002');
  assert.equal(c, 'MNLR-AGFEL-0926-0001', 'the two programmes share a counter');
  assert.equal(d, 'MNLR-AKFEL-1026-0001', 'a second intake did not restart the run');

  await Program.deleteOne({ _id: gen._id });
  await Counter.deleteMany({});
});

test('numbers do not collide when issued at the same moment', async () => {
  const when = { name: 'Kickstarter · Dec 2026' };
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
    ['batch', 'code', 'issuedAt', 'mentorName', 'mentorRole', 'name', 'programme', 'revoked', 'revokedAt', 'valid'],
  );
  // The things a verifier has no business receiving.
  const serialized = JSON.stringify(view);
  for (const leak of [String(cert.studentId), String(cert._id), 'asha@test.in', 'passwordHash']) {
    assert.ok(!serialized.includes(leak), `public view leaked ${leak}`);
  }
  assert.equal(view.valid, true);
});

test('the signing mentor is taken from the batch and then frozen', async () => {
  const mentor = await User.create({
    email: 'mentor@test.in', fullName: 'Sridevi Edupuganti', role: 'mentor', passwordHash: 'x',
    professional: { title: 'AI Generalist', company: 'Ex-Microsoft' },
  });
  const b = await Batch.create({
    programId: program._id, name: 'Kickstarter · Oct 2026',
    studentIds: [students[0]._id], mentorIds: [mentor._id], status: 'ongoing',
  });
  const { cert } = await issueCertificate({ student: students[0], program, batch: b });
  assert.equal(cert.mentorName, 'Sridevi Edupuganti');
  assert.equal(cert.mentorRole, 'AI Generalist, Ex-Microsoft | Mentor, Menler');

  // Frozen: the mentor changing employer must not re-sign what is already out.
  await User.findByIdAndUpdate(mentor._id, { professional: { title: 'AI Lead', company: 'Ex-Google' } });
  const reread = await Certificate.findById(cert._id);
  assert.equal(reread.mentorRole, 'AI Generalist, Ex-Microsoft | Mentor, Menler');

  // A batch with no mentor leaves the fields empty, so the sheet can fall back
  // to the founder's signature alone rather than drawing an empty line.
  const solo = await Batch.create({ programId: program._id, name: 'No mentor', studentIds: [students[1]._id], status: 'ongoing' });
  const { cert: c2 } = await issueCertificate({ student: students[1], program, batch: solo });
  assert.equal(c2.mentorName, '');
  assert.equal(c2.mentorRole, '');

  await Certificate.deleteMany({ batchId: { $in: [b._id, solo._id] } });
  await Batch.deleteMany({ _id: { $in: [b._id, solo._id] } });
  await User.deleteOne({ _id: mentor._id });
});

test('an admin-issued certificate is hidden from the student until it is emailed', async () => {
  const admin = await User.create({ email: 'boss@test.in', fullName: 'An Admin', role: 'admin', passwordHash: 'x' });
  const b = await Batch.create({ programId: program._id, name: 'Kickstarter · Nov 2026', studentIds: [students[0]._id], status: 'ongoing' });

  const { cert } = await issueCertificate({ student: students[0], program, batch: b, issuedBy: admin._id });
  assert.equal(cert.sentAt, null, 'issuing should not mark it sent');
  assert.equal(studentCanSee(cert), false, 'the student can see it before anyone told them');

  // Sending is what releases it.
  cert.sentAt = new Date();
  assert.equal(studentCanSee(cert), true, 'sending did not release it');

  // A certificate the student claimed themselves has nobody to wait for.
  const own = await issueCertificate({ student: students[1], program, batch: b });
  assert.equal(own.cert.issuedBy, null);
  assert.equal(studentCanSee(own.cert), true, 'a self-claimed certificate was withheld');

  await Certificate.deleteMany({ batchId: b._id });
  await Batch.deleteOne({ _id: b._id });
  await User.deleteOne({ _id: admin._id });
});

test('the signing line prefers what an admin typed over what a profile guesses', () => {
  // Nothing known: the floor, true of everyone who signs, rather than a blank
  // line under a rule.
  assert.equal(signingRole({}), 'Mentor, Menler');
  // A profile is a decent guess.
  assert.equal(
    signingRole({ professional: { title: 'AI Generalist', company: 'Ex-Microsoft' } }),
    'AI Generalist, Ex-Microsoft | Mentor, Menler',
  );
  // What somebody typed wins over the guess, whatever the profile says.
  assert.equal(
    signingRole({ certificateRole: 'Head of Curriculum, Menler', professional: { title: 'AI Generalist', company: 'Ex-Microsoft' } }),
    'Head of Curriculum, Menler',
  );
});

test('a signer passed at issue is used and then frozen', async () => {
  const mentor = await User.create({ email: 'sign@test.in', fullName: 'Real Mentor', role: 'mentor', passwordHash: 'x' });
  const b = await Batch.create({ programId: program._id, name: 'Kickstarter · Feb 2027', studentIds: [students[0]._id], mentorIds: [mentor._id], status: 'ongoing' });

  const { cert } = await issueCertificate({
    student: students[0], program, batch: b, issuedBy: students[1]._id,
    signer: { name: 'Someone Else', role: 'Guest Mentor, Menler' },
  });
  assert.equal(cert.mentorName, 'Someone Else', 'the typed name was ignored');
  assert.equal(cert.mentorRole, 'Guest Mentor, Menler', 'the typed designation was ignored');

  // An empty override falls back rather than printing a blank line.
  await Certificate.deleteMany({ batchId: b._id });
  const { cert: c2 } = await issueCertificate({
    student: students[0], program, batch: b, signer: { name: '  ', role: '' },
  });
  assert.equal(c2.mentorName, 'Real Mentor');
  assert.equal(c2.mentorRole, 'Mentor, Menler');

  await Certificate.deleteMany({ batchId: b._id });
  await Batch.deleteOne({ _id: b._id });
  await User.deleteOne({ _id: mentor._id });
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
