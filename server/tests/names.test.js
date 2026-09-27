// Reading a name off an email address. Needs no database.
//
//   node --test tests/names.test.js
//
// The failure that matters is a confident wrong name: it prints on a
// certificate and nobody notices, where an empty one shows as "-" on the
// admin's list until someone types it in.

import test from 'node:test';
import assert from 'node:assert/strict';

import { nameFromEmail, nameForNewAccount } from '../utils/names.js';

test('an institutional address is the name, with the cohort tag dropped', () => {
  assert.equal(nameFromEmail('vanshika.madan26m@iimranchi.ac.in'), 'Vanshika Madan');
  assert.equal(nameFromEmail('navneet.patel26m@iimranchi.ac.in'), 'Navneet Patel');
  assert.equal(nameFromEmail('manas.gupta26b@iimranchi.ac.in'), 'Manas Gupta');
  assert.equal(nameFromEmail('Soham.Chatterjee26m@IIMRanchi.ac.in'), 'Soham Chatterjee');
});

test('underscores, hyphens, a +tag and a trailing year are read the same way', () => {
  assert.equal(nameFromEmail('priya_sharma@gmail.com'), 'Priya Sharma');
  assert.equal(nameFromEmail('rahul-verma+lms@outlook.com'), 'Rahul Verma');
  assert.equal(nameFromEmail('padhmavathi.j2007@gmail.com'), 'Padhmavathi J');
  assert.equal(nameFromEmail('anil.kumar.reddy@company.in'), 'Anil Kumar Reddy');
});

test('an address that does not spell a name gives none, rather than a guess', () => {
  assert.equal(nameFromEmail('aryaagrim13@gmail.com'), '');   // one word: Arya Agrim or Aryaa Grim?
  assert.equal(nameFromEmail('shrivahire@gmail.com'), '');
  assert.equal(nameFromEmail('a.b@x.com'), '');               // initials
  assert.equal(nameFromEmail('r2d2.fan@x.com'), '');          // a number inside a word
  assert.equal(nameFromEmail('a.b.c.d.e@x.com'), '');
  assert.equal(nameFromEmail(''), '');
  assert.equal(nameFromEmail(undefined), '');
});

test('a name the admin typed always wins over the email', () => {
  assert.equal(nameForNewAccount('  Vanshika M.  ', 'vanshika.madan26m@iimranchi.ac.in'), 'Vanshika M.');
  assert.equal(nameForNewAccount('', 'vanshika.madan26m@iimranchi.ac.in'), 'Vanshika Madan');
  assert.equal(nameForNewAccount(undefined, 'aryaagrim13@gmail.com'), '');
});
