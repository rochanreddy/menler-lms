import mongoose from 'mongoose';

// An assignment or project set for a batch. Students submit; mentors grade.
const assignmentSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    type: { type: String, enum: ['assignment', 'project'], default: 'assignment', index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Which week of the programme this belongs to, so the student's list can be
    // grouped the way the syllabus is. Null for anything a mentor set outside
    // the curriculum, which then sorts after the numbered weeks rather than
    // being forced into one.
    week: { type: Number, default: null },
    // What to call that group in the list. The number above only orders them;
    // Generalist counts in weeks and Kickstarter in sessions, and printing
    // "Week 1" over a Kickstarter session would be plainly wrong.
    groupLabel: { type: String, default: '' },
    // Submissions open at startDate and close at dueDate. Both optional —
    // null start means "open immediately", null due means "no cutoff".
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    // File types a Drive-folder submission must contain to pass verification.
    // Listing 'html' also opts this assignment out of the default HTML block.
    // See utils/driveVerify.js.
    requiredDriveTypes: {
      type: [String],
      enum: ['video', 'image', 'doc', 'slides', 'html'],
      default: ['video', 'image', 'doc'],
    },
  },
  { timestamps: true },
);

export const Assignment = mongoose.model('Assignment', assignmentSchema, 'lms_assignments');
