import mongoose from 'mongoose';

// Curriculum hierarchy from the canvas: Program → Module → Chapter → Topic.
// Edited together as one tree, so embedded as sub-documents.

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    contentType: { type: String, enum: ['video', 'pdf', 'text'], default: 'text' },
    contentUrl: { type: String, default: '' },
    body: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: true },
);

const chapterSchema = new mongoose.Schema(
  { title: { type: String, required: true }, order: { type: Number, default: 0 }, topics: { type: [topicSchema], default: [] } },
  { _id: true },
);

const moduleSchema = new mongoose.Schema(
  { title: { type: String, required: true }, order: { type: Number, default: 0 }, chapters: { type: [chapterSchema], default: [] } },
  { _id: true },
);

const programSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true }, // e.g. "Kickstarter", "Fellowship"
    slug: { type: String, default: '', trim: true, index: true },
    type: { type: String, default: '' },
    description: { type: String, default: '' },
    published: { type: Boolean, default: false },
    modules: { type: [moduleSchema], default: [] },
  },
  { timestamps: true },
);

export const Program = mongoose.model('Program', programSchema, 'lms_programs');
