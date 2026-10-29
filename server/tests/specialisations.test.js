// What the specialisation editor is allowed to store. Needs no database.
//
//   node --test tests/specialisations.test.js
//
// The editor saves the whole syllabus in one request, so this is the only
// gate between a browser and the stored tree: links a student will click,
// ids that must survive a rename, and the six tracks themselves.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SPECIALISATIONS, SyllabusError, cleanModules, cleanResources, syllabusCounts } from '../utils/specialisations.js';

const ID = '65f000000000000000000001';
const FILE = '/uploads/65f0000000000000000000aa';

test('the six tracks, each with a distinct key', () => {
  assert.deepEqual(SPECIALISATIONS.map((s) => s.title), [
    'Analyst', 'Finance Operations', 'Founder’s Office', 'Human Resource', 'Marketing', 'Product Management',
  ]);
  assert.equal(new Set(SPECIALISATIONS.map((s) => s.key)).size, 6);
});

test('an existing module keeps its id; a new one is given one', () => {
  const [kept, fresh] = cleanModules([{ _id: ID, title: 'Week 1' }, { title: 'Week 2' }]);
  assert.equal(String(kept._id), ID, 'renaming a module must not re-mint it');
  assert.ok(fresh._id, 'a module added in the editor gets an id');
  assert.notEqual(String(fresh._id), ID);
});

test('text is trimmed and unknown fields are dropped', () => {
  const [m] = cleanModules([{ title: '  Week 1  ', hack: 'x', lessons: [{ title: ' Intro ', role: 'admin' }] }]);
  assert.equal(m.title, 'Week 1');
  assert.equal(m.hack, undefined);
  assert.equal(m.lessons[0].title, 'Intro');
  assert.equal(m.lessons[0].role, undefined);
});

test('a module or lesson with no title is refused, naming which', () => {
  assert.throws(() => cleanModules([{ title: '' }]), (e) => e instanceof SyllabusError && /Module 1/.test(e.message));
  assert.throws(() => cleanModules([{ title: 'Week 1', lessons: [{ title: ' ' }] }]), /Lesson 1 in “Week 1”/);
});

test('reading material is a stored file or a .pdf link, never a script', () => {
  assert.equal(cleanModules([{ title: 'W', readingUrl: FILE, readingName: 'book.pdf' }])[0].readingUrl, FILE);
  assert.equal(cleanModules([{ title: 'W', readingUrl: 'https://x.org/book.pdf?dl=1' }])[0].readingUrl, 'https://x.org/book.pdf?dl=1');
  assert.throws(() => cleanModules([{ title: 'W', readingUrl: 'javascript:alert(1)' }]), SyllabusError);
  // A Drive page is not a PDF; in the reader it would be a blank box.
  assert.throws(() => cleanModules([{ title: 'W', readingUrl: 'https://drive.google.com/file/d/abc/view' }]), /uploaded PDF/);
});

test('teacher notes: any stored file or https link, deduped, kind defaulting to notes', () => {
  const [m] = cleanModules([{
    title: 'W',
    materials: [
      { url: FILE, name: 'Deck.pptx' },
      { url: FILE, name: 'Deck again' },
      { url: 'https://docs.google.com/x', name: '', kind: 'resource' },
      { url: '' },
    ],
  }]);
  assert.equal(m.materials.length, 2, 'the same file twice on one node is one entry; an empty row is skipped');
  assert.equal(m.materials[0].kind, 'notes');
  assert.equal(m.materials[1].kind, 'resource');
  assert.equal(m.materials[1].name, 'https://docs.google.com/x', 'a link with no name is called by its address');
  assert.throws(() => cleanModules([{ title: 'W', materials: [{ url: 'data:text/html,hi' }] }]), /https/);
});

test('a class link must be http(s)', () => {
  assert.equal(cleanModules([{ title: 'W', lessons: [{ title: 'L', classLink: 'https://zoom.us/j/1' }] }])[0].lessons[0].classLink, 'https://zoom.us/j/1');
  assert.throws(() => cleanModules([{ title: 'W', lessons: [{ title: 'L', classLink: 'zoom.us/j/1' }] }]), /class link/);
});

test('the track-wide resources list is cleaned the same way', () => {
  assert.equal(cleanResources([{ url: FILE, name: 'Handbook' }]).length, 1);
  assert.throws(() => cleanResources([{ url: 'ftp://x' }]), SyllabusError);
  assert.deepEqual(cleanResources(undefined), []);
});

test('a syllabus that is not a list is refused rather than wiped', () => {
  assert.throws(() => cleanModules(null), SyllabusError);
  assert.throws(() => cleanModules({ title: 'W' }), SyllabusError);
});

test('counts for the admin cards', () => {
  const spec = {
    resources: [{ url: FILE }],
    modules: [
      { readingUrl: FILE, materials: [{}, {}], lessons: [{ readingUrl: '', materials: [{}] }, { readingUrl: FILE, materials: [] }] },
      { lessons: [] },
    ],
  };
  assert.deepEqual(syllabusCounts(spec), { modules: 2, lessons: 2, files: 6 });
});
