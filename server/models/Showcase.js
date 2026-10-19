import mongoose from 'mongoose';

// A piece of work a Kickstarter student puts in front of their cohort: the
// thing they built, why they built it, and wherever it can be seen.
//
// Deliberately NOT a Submission. A submission answers a brief and is graded;
// a showcase answers nothing and is never scored. It may name the project it
// grew out of (`assignmentId`), but most of what a student is proud of was
// never set as homework, and forcing every entry under an assignment would
// lose exactly those.
//
// Title, description and motive are what every entry must say. Links, a Drive
// folder and files are whatever the work happens to need: a live site has a
// URL and no PDF, a research write-up is a PDF and nothing else.

const linkSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    label: { type: String, default: '' },
  },
  { _id: false },
);

// A stored file (models/FileAsset.js, kind 'showcase-file'). Its own row, never
// hash-shared, so deleting the entry can delete the bytes.
const fileSchema = new mongoose.Schema({
  url: { type: String, required: true },
  name: { type: String, required: true },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 },
});

const showcaseSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Optional: the assignment or project this grew out of, in the same batch.
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },

    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    motive: { type: String, required: true },

    links: { type: [linkSchema], default: [] },
    driveLink: { type: String, default: '' },
    files: { type: [fileSchema], default: [] },
  },
  { timestamps: true },
);

showcaseSchema.index({ batchId: 1, createdAt: -1 });

export const Showcase = mongoose.model('Showcase', showcaseSchema, 'lms_showcases');
