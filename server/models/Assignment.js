import mongoose from 'mongoose';

// An assignment or project set for a batch. Students submit; mentors grade.
const assignmentSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    type: { type: String, enum: ['assignment', 'project'], default: 'assignment', index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    dueDate: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Assignment = mongoose.model('Assignment', assignmentSchema, 'lms_assignments');
