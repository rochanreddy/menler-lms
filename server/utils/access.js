import { Batch } from '../models/Batch.js';

const has = (arr, id) => (arr || []).some((x) => x.toString() === id);

/** Admin, or a mentor/student attached to the batch. */
export async function canAccessBatch(user, batchId) {
  if (user.role === 'admin') return true;
  const b = await Batch.findById(batchId).select('mentorIds studentIds');
  if (!b) return false;
  const id = user._id.toString();
  return has(b.mentorIds, id) || has(b.studentIds, id);
}

/** Admin, or a mentor of the batch (i.e. allowed to grade / mark attendance). */
export async function isMentorOfBatch(user, batchId) {
  if (user.role === 'admin') return true;
  const b = await Batch.findById(batchId).select('mentorIds');
  return !!b && has(b.mentorIds, user._id.toString());
}

/** Batch ids the user belongs to (mentor teaches, student enrolled). */
export async function myBatchIds(user) {
  if (user.role === 'admin') return (await Batch.find().select('_id')).map((b) => b._id);
  const key = user.role === 'mentor' ? 'mentorIds' : 'studentIds';
  const batches = await Batch.find({ [key]: user._id }).select('_id');
  return batches.map((b) => b._id);
}
