import mongoose from 'mongoose';

// A file on the Webinars tab that belongs to no single masterclass: a
// playbook, a cheat sheet, a template pack. `Webinar.resources` covers the
// hand-out that went with one session; this covers the shelf beside them,
// which is what a file has to go on when it came from everywhere or nowhere.
// Forcing it onto a session row would file it under a masterclass it was
// never part of, and a student looking for it would have to guess which.
//
// Same two shapes as a curriculum node's `materials`: a PDF in our store
// (/uploads/<id>) or a pasted link.
const webinarResourceSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const WebinarResource = mongoose.model('WebinarResource', webinarResourceSchema, 'lms_webinar_resources');
