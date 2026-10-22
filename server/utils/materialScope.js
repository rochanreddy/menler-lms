// Which batch a teacher note is for.
//
// A mentor's notes are what THAT mentor taught THAT cohort: the deck from
// Tuesday's class, a notice about Friday. They live on the curriculum node
// (Program.modules[…].materials), and the curriculum is shared by every batch
// of the programme — so before this, a new intake opened Week 1 and found the
// previous cohort's mentor's decks under Teacher notes, from a class they
// never sat and a mentor they will never meet.
//
// So a material carries `batchIds`, set when it is pushed (POST
// /programs/:id/materials takes the batch the mentor picked), and a student
// sees a material only through a batch it was pushed to.
//
// Notes pushed before batchIds existed carry none. Those belong to the
// cohorts that were running when they went up — a batch created AFTER the
// note was pushed did not exist to be taught it. That one rule keeps every
// note where it already was for the September cohorts and keeps them all off
// a November batch, without a migration anyone has to remember to run.
//
// Only what a STUDENT is served is filtered. Mentors and admins read the
// whole tree because they save it back whole (PATCH /programs/:id): a tree
// that came down filtered would go back up missing every other batch's notes.

const idOf = (x) => String(x?._id || x || '');

/** When a material was pushed: addedAt, else the instant in its ObjectId. */
export function materialTime(m) {
  if (m?.addedAt) return new Date(m.addedAt).getTime();
  const id = idOf(m?._id);
  return /^[a-f0-9]{24}$/i.test(id) ? parseInt(id.slice(0, 8), 16) * 1000 : 0;
}

/**
 * Is this material for this batch? `batch` needs `_id` and `createdAt`.
 */
export function materialInBatch(m, batch) {
  const ids = (m?.batchIds || []).map(idOf).filter(Boolean);
  if (ids.length) return ids.includes(idOf(batch));
  // Pushed before notes were per batch: for the batches that existed then.
  const born = batch?.createdAt ? new Date(batch.createdAt).getTime() : 0;
  return born <= materialTime(m);
}

/** Visible through any of these batches. */
export const materialInAny = (m, batches) => (batches || []).some((b) => materialInBatch(m, b));

/**
 * A copy of a plain programme tree with every node's materials cut down to
 * the ones these batches were given. Takes a plain object (toObject / lean).
 */
export function scopeMaterials(program, batches) {
  const keep = (list) => (list || []).filter((m) => materialInAny(m, batches));
  return {
    ...program,
    modules: (program.modules || []).map((mod) => ({
      ...mod,
      materials: keep(mod.materials),
      chapters: (mod.chapters || []).map((ch) => ({
        ...ch,
        materials: keep(ch.materials),
        topics: (ch.topics || []).map((t) => ({ ...t, materials: keep(t.materials) })),
      })),
    })),
  };
}
