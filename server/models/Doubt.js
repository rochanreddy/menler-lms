import mongoose from 'mongoose';

// A post on a batch's forum. Two boards share this collection, told apart by
// `kind`: a doubt (a question, students only) and a share (something useful the
// poster found, open to mentors too). They are the same object — text, likes,
// comments, one batch — so they are one schema rather than two near-identical
// ones; only the copy and who may post differ.
const commentSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { _id: true, timestamps: true },
);

const doubtSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    // Rows written before the share board existed carry no `kind` at all, so
    // every read for doubts must accept a missing field as well as 'doubt'.
    kind: { type: String, enum: ['doubt', 'share'], default: 'doubt' },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true },
);

// The board query is always batch + kind, newest first.
doubtSchema.index({ batchId: 1, kind: 1, createdAt: -1 });

export const Doubt = mongoose.model('Doubt', doubtSchema, 'lms_doubts');
