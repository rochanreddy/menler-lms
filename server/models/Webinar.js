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
  },
  { timestamps: true },
);

export const Webinar = mongoose.model('Webinar', webinarSchema, 'lms_webinars');
