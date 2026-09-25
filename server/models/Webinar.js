import mongoose from 'mongoose';

// A webinar/masterclass. Mentor/admin schedule it; everyone can see the list,
// join link, slides, and recording afterwards.
const webinarSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    startsAt: { type: Date, default: null },
    joinUrl: { type: String, default: '' },
    pptUrl: { type: String, default: '' },
    recordingUrl: { type: String, default: '' },

    // Extra resources handed out with the session: the deck as a PDF, a cheat
    // sheet, a prompt pack. A list rather than another single slot next to
    // pptUrl, because a masterclass gives out more than one file and an admin
    // should not have to pick which one the tab is allowed to show. Each entry
    // is a stored PDF (/uploads/<id>) or a pasted link, the same two shapes a
    // curriculum node's `materials` takes.
    resources: {
      type: [new mongoose.Schema({
        url: { type: String, required: true, trim: true },
        name: { type: String, required: true, trim: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        addedAt: { type: Date, default: Date.now },
      })],
      default: [],
    },
  },
  { timestamps: true },
);

export const Webinar = mongoose.model('Webinar', webinarSchema, 'lms_webinars');
