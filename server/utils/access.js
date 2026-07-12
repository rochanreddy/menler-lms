import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';

const has = (arr, id) => (arr || []).some((x) => x.toString() === id);

/** Program ids a mentor is assigned to teach. */
async function myProgramIds(user) {
  const progs = await Program.find({ mentorIds: user._id }).select('_id');
  return progs.map((p) => p._id);
}

/** Admin, or a mentor of the batch, or a mentor of the batch's program. */
export async function isMentorOfBatch(user, batchId) {
  if (user.role === 'admin') return true;
  if (user.role !== 'mentor') return false;
  const b = await Batch.findById(batchId).select('mentorIds programId');
  if (!b) return false;
  if (has(b.mentorIds, user._id.toString())) return true;
  const prog = await Program.findById(b.programId).select('mentorIds');
  return !!prog && has(prog.mentorIds, user._id.toString());
}

/** Admin, a student in the batch, or a mentor (batch- or program-level). */
export async function canAccessBatch(user, batchId) {
  if (user.role === 'admin') return true;
  const b = await Batch.findById(batchId).select('mentorIds studentIds programId');
  if (!b) return false;
  const id = user._id.toString();
  if (has(b.studentIds, id) || has(b.mentorIds, id)) return true;
  if (user.role === 'mentor') {
    const prog = await Program.findById(b.programId).select('mentorIds');
    return !!prog && has(prog.mentorIds, id);
  }
  return false;
}

/** Batch ids the user belongs to. Mentors also get every batch of the
 *  programs they teach; students get batches they're enrolled in. */
export async function myBatchIds(user) {
  if (user.role === 'admin') return (await Batch.find().select('_id')).map((b) => b._id);
  if (user.role === 'mentor') {
    const programIds = await myProgramIds(user);
    const batches = await Batch.find({ $or: [{ mentorIds: user._id }, { programId: { $in: programIds } }] }).select('_id');
    return batches.map((b) => b._id);
  }
  const batches = await Batch.find({ studentIds: user._id }).select('_id');
  return batches.map((b) => b._id);
}
