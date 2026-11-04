// A student in more than one batch: which one they are looking at, and how
// their work reads across the two.
//
// A student from September can be given November as well. They then have two
// of everything, and two different kinds of "two":
//
// Classes, notices, attendance, teacher notes and the Drive belong to a cohort,
// so the student looks at one batch at a time and the dropdown in the top bar
// picks which. It travels as the X-Active-Batch header, a preference and not a
// permission: it is only ever matched against batches the student is already
// in, so an id that is stale or typed by hand falls back to the default rather
// than widening or refusing anything.
//
// Assignments and projects do not change with it. Each batch has its own row
// for each piece of work and a submission hangs off one row, so a student in
// both would see every title twice, one of them looking unsubmitted. onePerWork
// shows each title once, on the row that holds their work.

const idOf = (x) => String(x?._id || x || '');
const startOf = (b) => new Date(b?.startDate || b?.createdAt || 0).getTime();

/** The batch in view: the one asked for if it is theirs, else the newest intake. */
export function pickActiveBatch(batches, wanted) {
  const list = batches || [];
  return list.find((b) => idOf(b) === String(wanted || ''))
    || [...list].sort((x, y) => startOf(y) - startOf(x))[0]
    || null;
}

/**
 * These batches with the rest of the active one's programme taken out. Another
 * programme's batch stays: it is the only batch that programme has in view, and
 * dropping it would empty that programme's teacher notes.
 */
export function inView(batches, wanted) {
  const list = batches || [];
  if (list.length < 2) return list;
  const active = pickActiveBatch(list, wanted);
  return list.filter((b) => idOf(b) === idOf(active) || idOf(b.programId) !== idOf(active.programId));
}

// Work first, so nothing handed in can be hidden by an empty row of the same title.
const workRank = (submission) => {
  if (!submission) return 0;
  return submission.score != null || submission.status === 'graded' ? 2 : 1;
};

/**
 * Each piece of work once, per programme. Matched on the title, which is what
 * syncCurriculumAssignments.js matches on, so two batches' rows cannot disagree.
 * The row with the student's work wins, else the newest batch's, so anything
 * not yet handed in goes to the cohort being taught now. Order is kept.
 *
 * @param assignments rows, with batchId either an id or populated
 * @param submissionOf (assignmentId string) => the student's submission or null
 * @param batches the student's batches, each with _id and programId
 */
export function onePerWork(assignments, submissionOf, batches) {
  const batchById = new Map((batches || []).map((b) => [idOf(b), b]));
  const rank = (a) => [workRank(submissionOf(idOf(a))), startOf(batchById.get(idOf(a.batchId)))];
  const best = new Map();
  for (const a of assignments) {
    const batch = batchById.get(idOf(a.batchId));
    // A row whose batch is unknown is never merged with anything.
    const key = batch ? `${idOf(batch.programId)}\u0000${a.title}` : idOf(a);
    const have = best.get(key);
    if (!have) { best.set(key, a); continue; }
    const [work, start] = rank(a);
    const [haveWork, haveStart] = rank(have);
    if (work > haveWork || (work === haveWork && start > haveStart)) best.set(key, a);
  }
  const kept = new Set(best.values());
  return assignments.filter((a) => kept.has(a));
}
