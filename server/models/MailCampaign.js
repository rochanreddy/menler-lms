import mongoose from 'mongoose';

// One mail, to the students of one or more batches, at one moment.
//
// The row IS the schedule: there is no timer object, no queue. The scheduler
// (utils/mailCampaigns.js) wakes every minute, claims any row whose `sendAt`
// has passed and is still `scheduled`, and sends it. Claiming is a single
// atomic status flip — `scheduled` → `sending` — so two server instances (or a
// restart mid-send) cannot deliver the same campaign twice.
//
// A compose that goes out at several times in a day is several rows with the
// same copy, one per time. Each has its own status and its own counts, so
// "the 9 am one went, the 6 pm one is waiting" is a fact the list can show
// and a single row with a list of times could not.
export const CAMPAIGN_STATUSES = ['scheduled', 'sending', 'sent', 'failed', 'cancelled'];

const resultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, default: '' },
    ok: { type: Boolean, default: false },
    error: { type: String, default: '' },
  },
  { _id: false },
);

// A file sent with the mail. The bytes are a FileAsset (kind
// 'mail-attachment'); the name and size are copied here so the list can say
// what went out without loading them.
const attachmentSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileAsset', required: true },
    name: { type: String, required: true },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: 'application/octet-stream' },
  },
  { _id: false },
);

const mailCampaignSchema = new mongoose.Schema(
  {
    batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch', index: true }],
    // The batch's mentors get a copy too, so they know what their students
    // were told. Off by default: most campaigns are for students alone.
    includeMentors: { type: Boolean, default: false },

    subject: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 20000 },
    attachments: { type: [attachmentSchema], default: [] },

    sendAt: { type: Date, required: true, index: true },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'scheduled', index: true },

    // Filled in as the send runs.
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    recipients: { type: Number, default: 0 }, // planned
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    // Why the whole run failed, when it did (mail not configured, audience
    // empty). Per-recipient errors live on `results`.
    error: { type: String, default: '' },
    results: [resultSchema],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const MailCampaign = mongoose.model('MailCampaign', mailCampaignSchema, 'lms_mail_campaigns');
