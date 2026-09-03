import mongoose from 'mongoose';

// Which VdoCipher video plays for a given lesson, FOR ONE BATCH.
//
// The curriculum tree (Program.modules) is shared by every batch running that
// programme, so the video cannot live on the topic itself: a Kickstarter batch
// that started in February and one that started in March study the same
// lessons but each has its own class recordings, and the March cohort must not
// be able to watch February's before their own class has happened. Keying the
// mapping on (batchId, topicId) is what keeps those apart — a lesson with no
// row for your batch simply has no video yet.
//
// Only the VdoCipher video id is stored (plus its title, cached purely so the
// admin UI can show what's attached without a round trip to VdoCipher). The
// bytes live in VdoCipher; playback is always via a short-lived OTP.
const batchLessonVideoSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    // The _id of a topic inside Program.modules[].chapters[].topics[]. Not a
    // ref: topics are sub-documents, so there is no collection to populate.
    topicId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    videoId: { type: String, required: true },
    title: { type: String, default: '' },
  },
  { timestamps: true },
);

// One video per lesson per batch — re-attaching replaces rather than stacks.
batchLessonVideoSchema.index({ batchId: 1, topicId: 1 }, { unique: true });

export const BatchLessonVideo = mongoose.model('BatchLessonVideo', batchLessonVideoSchema, 'lms_batch_lesson_videos');
