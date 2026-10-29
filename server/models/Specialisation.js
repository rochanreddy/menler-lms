import mongoose from 'mongoose';

// A specialisation: the track a student takes up after the six weeks of the
// AI Generalist — Analyst, Finance Operations, Founder's Office, Human
// Resource, Marketing, Product Management (utils/specialisations.js).
//
// Deliberately NOT a Program. A Program has batches, sessions, assignments,
// grading, progress and a place in every dropdown that lists courses; a
// specialisation is run by the admin from its own tab and touches none of
// that. Keeping it a separate collection is what keeps it from leaking into
// the batch screens, the Learning tab, the certificate rule or the gradebook.
//
// The syllabus is two levels — modules, each with lessons — and every level
// carries the same two things a Generalist week does: one reading PDF (the
// ebook, opened in the reader) and a list of teacher notes (the deck, a
// template). A lesson with no reading of its own opens its module's, the
// same lesson → module rule as the main curriculum.

// One file the admin put up: a PDF or other document in our store
// (/uploads/<id>), or a link. Same shape as a curriculum node's `materials`,
// so the student's Teacher notes list can render either without caring which.
const materialSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: { type: String, default: '' },
    // 'notes' (the deck, what was taught) or 'resource' (a notice, a template,
    // further reading). The student's list is split on it.
    kind: { type: String, enum: ['notes', 'resource'], default: 'notes' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' }, // markdown
    // The live class or its recording. Opened in a new tab, never inlined:
    // a Drive share link is a page, not a media file.
    classLink: { type: String, default: '' },
    readingUrl: { type: String, default: '' },
    readingName: { type: String, default: '' },
    materials: { type: [materialSchema], default: [] },
  },
  { _id: true },
);

const moduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: '' }, // markdown
    readingUrl: { type: String, default: '' },
    readingName: { type: String, default: '' },
    materials: { type: [materialSchema], default: [] },
    lessons: { type: [lessonSchema], default: [] },
  },
  { _id: true },
);

const specialisationSchema = new mongoose.Schema(
  {
    // Stable identity. The title is the admin's to reword; the key is what
    // the six are found by, so a rename never mints a seventh.
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' }, // markdown, shown above the syllabus
    order: { type: Number, default: 0 },
    // Files for the whole track rather than one module: a handbook, a
    // reading list, a template pack.
    resources: { type: [materialSchema], default: [] },
    modules: { type: [moduleSchema], default: [] },
  },
  { timestamps: true },
);

export const Specialisation = mongoose.model('Specialisation', specialisationSchema, 'lms_specialisations');

// Where one student stands. One row per student, held by a unique index, so a
// student is in at most one specialisation and a second allotment MOVES them
// rather than enrolling them twice.
//
//   no row                         → not decided yet
//   status 'allotted' + an id      → in that specialisation
//   status 'opted_out', id null    → finished the Generalist, took no track
//
// "Not opting" is recorded rather than left as the absence of a row, because
// "said no" and "nobody has asked them yet" are different facts to an admin
// working down a list of thirty.
const allotmentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    specialisationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Specialisation', default: null, index: true },
    status: { type: String, enum: ['allotted', 'opted_out'], required: true },
    allottedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    allottedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const SpecialisationAllotment = mongoose.model('SpecialisationAllotment', allotmentSchema, 'lms_specialisation_allotments');
