// When a student joined a batch, which is not when their account was made.
//
// The class review gate once asked about every class since the ACCOUNT was
// created. That is right for an account created straight into a batch and
// wrong for every other way in: an account made on the Students page and
// enrolled a week later, an existing student added to a second cohort, a
// returning student. Each of them met a wall of forms for classes they were
// never in. So enrolment is stamped per batch, here, and read back here.
import { User } from '../models/User.js';

/**
 * The instant from which `user` belongs to `batchId`. A membership stamped
 * before this field existed has no row and falls back to the account's
 * creation, which is what the gate used to use, so nothing moves backwards.
 */
export function joinedBatchAt(user, batchId) {
  const row = (user?.batchJoins || []).find((j) => String(j.batchId) === String(batchId));
  const created = user?.createdAt ? new Date(user.createdAt) : new Date(0);
  if (!row?.at) return created;
  const at = new Date(row.at);
  // Never earlier than the account: a person cannot join before they exist.
  return at > created ? at : created;
}

/** A class is the student's to review only if it started after they joined its batch. */
export function wasEnrolledFor(user, session) {
  const batchId = session.batchId?._id || session.batchId;
  return new Date(session.startsAt) >= joinedBatchAt(user, batchId);
}

/**
 * Record that a student joined a batch. Once only: the filter skips a user
 * who already has a row for it, so re-adding someone already enrolled keeps
 * their original date rather than wiping the reviews they owe.
 */
export async function stampBatchJoin(userId, batchId, at = new Date()) {
  await User.updateOne(
    { _id: userId, 'batchJoins.batchId': { $ne: batchId } },
    { $push: { batchJoins: { batchId, at } } },
  );
}

/** Forget it on removal, so a later re-enrolment starts from that day. */
export async function clearBatchJoin(userId, batchId) {
  await User.updateOne({ _id: userId }, { $pull: { batchJoins: { batchId } } });
}
