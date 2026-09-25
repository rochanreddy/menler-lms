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
    // Which of the five rubric weightings this piece of work is graded on.
    // See utils/rubric.js and docs/AI-GRADING-RUBRIC.md: the six criteria never
    // change, the WEIGHTS do, because a thirty-minute drill and a shipped
    // capstone are not the same kind of thing and scoring them on one
    // distribution marks the drill down for documentation it was never asked
    // for. Set by scripts/syncCurriculumAssignments.js from the curriculum.
    rubricClass: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], default: 'B' },

    // The explicit checklist the rubric's C1 (brief compliance) is scored
    // against. Every curriculum brief already ends in a "Submit: …" line; this
    // is that line, split. Scoring against a list rather than against the brief
    // as prose is the single largest accuracy gain in the review and it needs
    // no better model: "is the Prompt Cheat Sheet here" is checkable, "is it
    // complete" is a matter of opinion. Empty is allowed and the review says so.
    deliverables: { type: [String], default: [] },

    // What this session taught, so the rubric's C3 (AI craft) can check the
    // student used the feature the way it was taught rather than just "used AI".
    taught: { type: String, default: '' },

    // File types a Drive-folder submission must contain to pass verification.
    // Listing 'html' also opts this assignment out of the default HTML block.
    // See utils/driveVerify.js.
    //
    // The default demands a video of EVERY assignment, which is wrong for most
    // of the curriculum: a brief that asks for a Claude Artifact and a
    // screenshot was rejected as incomplete because no video was in the folder.
    // Video is still required wherever a brief actually asks for one (a Loom
    // walkthrough, a demo recording) — it is simply not required everywhere,
    // and it is never sent to a model. scripts/syncCurriculumAssignments.js
    // sets this per assignment from what the brief says.
    requiredDriveTypes: {
      type: [String],
      enum: ['video', 'image', 'doc', 'slides', 'html'],
      default: ['image', 'doc'],
    },

    // Lifts driveVerify's default block on HTML files without making one
    // mandatory. A Claude Artifact is the named deliverable of six Kickstarter
    // assignments and arrives as an .html file about as often as it arrives as
    // a PDF export, so both have to pass. See utils/driveVerify.js.
    allowHtml: { type: Boolean, default: false },

    // Stamps for the two reminder mails (utils/assignmentReminders.js), each
    // claimed atomically before the mail goes out so a restart or a second
    // instance cannot send it twice.
    //
    // The "open" mail goes once, ever. The due reminder records WHICH due date
    // it reminded about rather than just "sent": a deadline that is extended
    // after the reminder went out no longer matches, so the new date gets its
    // own reminder instead of the cohort being told nothing about it.
    openMailedAt: { type: Date, default: null },
    dueReminderFor: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Assignment = mongoose.model('Assignment', assignmentSchema, 'lms_assignments');
