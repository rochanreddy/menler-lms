import mongoose from 'mongoose';

// A support ticket: a student says something is wrong, an admin answers.
//
// A thread, not a pair of fields. "I can't open the recording" is almost never
// settled in one reply — the answer is a question ("which browser?"), and a
// ticket that cannot hold the second message pushes that conversation onto
// WhatsApp, where nobody else can see it and nothing is recorded.
//
// Deliberately NOT the forum. A doubt is about the course and is worth other
// students reading; a support ticket is about the student's own account, their
// payment, a link that won't open — private, and addressed to the admin rather
// than to the cohort.
const messageSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Stored rather than looked up from the author: who was speaking as what is
    // a fact about the message, and an admin who later becomes a mentor must
    // not retroactively turn their old answers into a student's.
    authorRole: { type: String, enum: ['student', 'mentor', 'admin'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { _id: true, timestamps: true },
);

const supportTicketSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Their batch at the moment of writing, for the admin's filter. Optional:
    // an unenrolled account with a login problem is exactly who needs support.
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },

    category: {
      type: String,
      enum: ['access', 'classes', 'content', 'payments', 'other'],
      default: 'other',
    },
    subject: { type: String, required: true, trim: true, maxlength: 160 },

    // open      — waiting on the admin (new, or the student wrote last)
    // answered  — the admin wrote last; the ball is with the student
    // resolved  — closed by the admin; a student reply reopens it
    //
    // Derived from who spoke last on every write rather than set by hand, so
    // the admin's queue ("open") can never disagree with the thread.
    status: { type: String, enum: ['open', 'answered', 'resolved'], default: 'open', index: true },

    messages: { type: [messageSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now },

    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// The admin queue is "everything still open, oldest first" and the student's
// own list is "mine, newest first" — one index serves the first, one the second.
supportTicketSchema.index({ status: 1, lastMessageAt: -1 });
supportTicketSchema.index({ studentId: 1, lastMessageAt: -1 });

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema, 'lms_support_tickets');
