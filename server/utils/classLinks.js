// Which Drive a lesson's "Watch class video" opens.
//
// A lesson's classLink lives on the curriculum, which every batch of a
// programme shares, while the recordings behind it belong to one cohort. So a
// November student opened Week 1 and got September's Drive folder, before
// their own class had happened, and a recording posted for November would have
// replaced September's.
//
// So a batch can own its link, in Batch.classDriveUrl:
//
//   null    the cohorts from before this: the curriculum's link, as it was
//   ''      its own, with nothing posted yet: "Video not available yet"
//   a URL   its own: every class lesson opens this
//
// A batch made from now on starts at '', so a new intake inherits nothing. The
// curriculum's link still says WHICH lessons had a class (an assignment has
// none), so a batch's Drive shows on those lessons and nowhere else.
//
// Only what a STUDENT is served is changed. Mentors and admins read the whole
// tree because they save it back whole, the same reason as materialScope.js.

const usesCurriculumLink = (batch) => batch?.classDriveUrl == null;

/**
 * What a lesson's link becomes for a student in these batches of the programme.
 * Enrolled in two? A batch still on the curriculum's link keeps it, else the
 * first with a Drive posted. No batch at all is nothing, never the shared link.
 */
export function classLinkFor(link, batches) {
  if (!link) return '';
  if ((batches || []).some(usesCurriculumLink)) return link;
  return (batches || []).map((b) => b.classDriveUrl).find(Boolean) || '';
}

/** A copy of a plain programme tree with each lesson's link resolved. */
export function scopeClassLinks(program, batches) {
  return {
    ...program,
    modules: (program.modules || []).map((mod) => ({
      ...mod,
      chapters: (mod.chapters || []).map((ch) => ({
        ...ch,
        topics: (ch.topics || []).map((t) => ({ ...t, classLink: classLinkFor(t.classLink, batches) })),
      })),
    })),
  };
}

/**
 * The value as the admin typed it, or undefined if it cannot be stored. It is
 * rendered as an href in a student's browser, so only http(s) gets through.
 * null hands the batch back to the curriculum's link.
 */
export function cleanClassDrive(value) {
  if (value === null) return null;
  const url = String(value ?? '').trim();
  if (!url) return '';
  return /^https?:\/\/\S+$/i.test(url) ? url : undefined;
}
