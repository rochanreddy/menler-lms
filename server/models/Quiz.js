import mongoose from 'mongoose';

// A quiz or exam set for a batch. Mentors author it; students attempt it once.
const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    options: { type: [String], default: [] }, // 2–6 choices
    correctIndex: { type: Number, default: 0 }, // index into options
  },
  { _id: true },
);

const quizSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['quiz', 'exam'], default: 'quiz', index: true },
    questions: { type: [questionSchema], default: [] },
  },
  { timestamps: true },
);

// Student-facing shape: never leaks the correct answers.
quizSchema.methods.forStudent = function forStudent() {
  return {
    _id: this._id,
    batchId: this.batchId,
    title: this.title,
    type: this.type,
    questions: this.questions.map((q) => ({ _id: q._id, text: q.text, options: q.options })),
  };
};

export const Quiz = mongoose.model('Quiz', quizSchema, 'lms_quizzes');
