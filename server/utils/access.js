import { Batch } from '../models/Batch.js';
import { Program } from '../models/Program.js';

const has = (arr, id) => (arr || []).some((x) => x.toString() === id);

/** Admin course-block: is this batch hidden from this (non-admin) user? */
export function isBlockedFromBatch(user, batchId) {
  if (user.role === 'admin') return false;
  return has(user.blocked?.batchIds, String(batchId));
}

/** Admin assignment/project-block: is this assignment hidden from this user? */
export function isBlockedFromAssignment(user, assignmentId) {
  if (user.role === 'admin') return false;
  return has(user.blocked?.assignmentIds, String(assignmentId));
}

/** Program ids a mentor is assigned to teach. This grants curriculum/content
 *  visibility only — it does NOT grant the ability to manage any batch. Batch
 *  management is authorised strictly by batch-level assignment (below). */
export async function myProgramIds(user) {
  const progs = await Program.find({ mentorIds: user._id }).select('_id');
  return progs.map((p) => p._id);
}

/** Can this user MANAGE the batch (attendance, announcements, quizzes, grading)?
 *  Admin, or a mentor the admin has explicitly assigned to THIS batch. A mentor
 *  who merely teaches the program is NOT enough — they must be on the batch. */
export async function isMentorOfBatch(user, batchId) {
  if (user.role === 'admin') return true;
  if (user.role !== 'mentor') return false;
  if (isBlockedFromBatch(user, batchId)) return false;
  const b = await Batch.findById(batchId).select('mentorIds');
  return !!b && has(b.mentorIds, user._id.toString());
}

/** Can this user SEE the batch? Admin, a student enrolled in it, or a mentor
 *  assigned to it. (Same batch-level rule — no program cascade.) */
export async function canAccessBatch(user, batchId) {
  if (user.role === 'admin') return true;
  if (isBlockedFromBatch(user, batchId)) return false;
  const b = await Batch.findById(batchId).select('mentorIds studentIds');
  if (!b) return false;
  const id = user._id.toString();
  return has(b.studentIds, id) || has(b.mentorIds, id);
}

/** Batch ids the user belongs to. Admin → all; mentor → batches they're assigned
 *  to; student → batches they're enrolled in. */
export async function myBatchIds(user) {
  if (user.role === 'admin') return (await Batch.find().select('_id')).map((b) => b._id);
  const field = user.role === 'mentor' ? { mentorIds: user._id } : { studentIds: user._id };
  const batches = await Batch.find(field).select('_id');
  // Admin-blocked batches simply disappear from the user's world.
  const blocked = new Set((user.blocked?.batchIds || []).map(String));
  return batches.map((b) => b._id).filter((id) => !blocked.has(id.toString()));
}
