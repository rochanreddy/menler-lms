import mongoose from 'mongoose';

// Curriculum hierarchy from the canvas: Program → Module → Chapter → Topic.
// Edited together as one tree, so embedded as sub-documents.

// One file a mentor pushed after class — a PDF stored through /uploads, or
// a link. Every week, session and lesson carries a list of these next to its
// single `notesUrl` slot, because the admin's notes are one file while a
// mentor's arrive three at a time (the deck, a notice, an extra reading) and
// nobody wants to pick which one is "the" notes. The student's Teacher notes
// chip lists the slot AND every material on the lesson, its session and its
// week; Reading material stays the admin's ebook alone.
//
// Added through POST /programs/:id/materials (which saves at once, no tree
// Save to forget) as well as through the curriculum editor's tree Save.
const materialSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: { type: String, default: '' },
    // What it is to the student: 'notes' (the deck, what was taught) or a
    // 'resource' (a notice, a template, further reading). The mentor says
    // which at upload; the student's list is split on it.
    kind: { type: String, enum: ['notes', 'resource'], default: 'notes' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    contentType: { type: String, enum: ['video', 'pdf', 'text'], default: 'text' },
    contentUrl: { type: String, default: '' },
    body: { type: String, default: '' },
    // Where this particular lecture meets. Set by hand and deliberately dumb:
    // a Zoom URL while the class is running, swapped for a YouTube URL once the
    // recording is up. We never inspect it — empty just means "not posted yet".
    classLink: { type: String, default: '' },
    // Two PDF files per lecture, both opened in the in-page PDF viewer.
    readingUrl: { type: String, default: '' },  // handout / reading (PDF)
    notesUrl: { type: String, default: '' },    // teacher notes (PDF)
    materials: { type: [materialSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: true },
);

const chapterSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    // As on a module: markdown shown in the reader when the chapter itself is
    // opened, rather than as lessons of its own.
    description: { type: String, default: '' },
    // What to call that page, in the syllabus and as its title. Defaults to
    // "Overview"; an assignment calls its page "Brief", because that is the
    // thing a student opens an assignment to read.
    pageLabel: { type: String, default: '' },
    // The session's ebook and notes. A lesson with an empty slot of its own
    // opens these, so a book that covers the whole session is attached once,
    // here, rather than copied onto every lesson under it — which is how the
    // ebooks are actually organised (one per week, or one per week+session).
    readingUrl: { type: String, default: '' },
    notesUrl: { type: String, default: '' },
    materials: { type: [materialSchema], default: [] },
    order: { type: Number, default: 0 },
    topics: { type: [topicSchema], default: [] },
  },
  { _id: true },
);

const moduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    // Markdown shown in the reader when the module itself is opened — the
    // week's objective and outcome, say — rather than as lessons of its own.
    description: { type: String, default: '' },
    // The week's ebook and notes — the fallback for every session and lesson
    // in it that has none of its own. Resolution is lesson → chapter → module.
    readingUrl: { type: String, default: '' },
    notesUrl: { type: String, default: '' },
    materials: { type: [materialSchema], default: [] },
    order: { type: Number, default: 0 },
    chapters: { type: [chapterSchema], default: [] },
  },
  { _id: true },
);

const programSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true }, // e.g. "Kickstarter", "Fellowship"
    slug: { type: String, default: '', trim: true, index: true },
    type: { type: String, default: '' },
    description: { type: String, default: '' },
    published: { type: Boolean, default: false },
    // Mentors assigned to teach this program — they get access to ALL its batches.
    mentorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    modules: { type: [moduleSchema], default: [] },
  },
  { timestamps: true },
);

export const Program = mongoose.model('Program', programSchema, 'lms_programs');
