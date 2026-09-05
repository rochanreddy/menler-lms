import mongoose from 'mongoose';

// Binary files that belong to the product rather than to a student's own Drive.
// Resumes from Profile, and curriculum PDFs uploaded from the admin editor
// (reading material, teacher notes, lesson PDFs).
//
// These live in Mongo rather than on the server's disk because the API runs on
// a host with an ephemeral filesystem -- anything written to ./uploads is gone
// on the next deploy, which would leave User.resumeUrl pointing at a 404.
// Submissions do NOT belong here: those stay in the student's Drive and we only
// keep the link (see models/Submission.js).
//
// `data` is select:false so that no ordinary query -- a list, a populate, a
// stray findById -- ever drags megabytes of file body into memory. The one
// route that serves bytes asks for it explicitly with .select('+data').
const fileAssetSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true, select: false },
    name: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['resume', 'curriculum-pdf'], default: 'resume', index: true },

    // SHA-256 of `data`, so the same file uploaded twice is stored once.
    // Course material is the case that needs it: one 750 KB ebook attached to
    // twenty lessons was being stored twenty times, because every drop in the
    // curriculum editor minted a new row. Empty on rows written before this
    // existed, which is why nothing may treat it as required.
    hash: { type: String, default: '', index: true },
  },
  { timestamps: true },
);

export const FileAsset = mongoose.model('FileAsset', fileAssetSchema, 'lms_files');
