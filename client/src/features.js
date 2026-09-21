/**
 * Feature switches for things that are built but not in use.
 *
 * VdoCipher is DRM-hosted lesson video: the player, the library picker, the
 * per-batch mapping, the OTP endpoint and the one-device watch lock. None of
 * it is deleted — the components, routes, models and tests all stay exactly
 * where they are — because "we are on Drive links for now" is a commercial
 * decision that can reverse, and deleting a working integration to get it off
 * the screen means rebuilding it later from git history.
 *
 * While this is false, lesson video is a plain link a mentor pastes in
 * (a Google Drive file or folder, or YouTube) and students open in a new tab.
 * Set VITE_VDOCIPHER_ENABLED=true to bring the DRM player back.
 */
export const VDOCIPHER_ENABLED = import.meta.env.VITE_VDOCIPHER_ENABLED === 'true';

/** Links we can only ever hand off to, never play in a <video> element. */
const HOSTED_ELSEWHERE = /(^https?:\/\/)?([^/]*\.)?(drive\.google\.com|docs\.google\.com|youtube\.com|youtu\.be|vimeo\.com|loom\.com|dropbox\.com|onedrive\.live\.com|sharepoint\.com)/i;

/**
 * Can this URL go straight into a <video src>?
 *
 * A Google Drive share link is an HTML page, not a media file, so putting it in
 * a <video> gives a black box and a decode error rather than anything a student
 * can watch. Those open in their own tab instead.
 */
export const isDirectVideoFile = (url) => !!url && !HOSTED_ELSEWHERE.test(url) && /\.(mp4|webm|ogg|ogv|m4v|mov)(\?|#|$)/i.test(url);

// What the two levels of a curriculum are called, judged from the module
// title. Generalist is weeks of sessions ("Week 1 · …" holding "S1 · …");
// Kickstarter is sessions of parts ("S01 · …" holding "1.1 · …") — there a
// mentor teaches the whole module in one sitting, so the module is "the
// session" and calling it a week on the mentor's page sent people looking
// for a session row that wasn't there.
export const tierNames = (moduleTitle) => (/^S\d+\b/i.test(String(moduleTitle || '').trim())
  ? { top: 'Session', topWhole: 'Whole session', sub: 'Part', fromTop: 'this session', fromSub: 'this part' }
  : { top: 'Week', topWhole: 'Whole week', sub: 'Session', fromTop: 'this week', fromSub: 'this session' });

// An assignment lesson ("Assignment: …") carries its own brief as its
// reading, and a session's handouts are not what a student opens it for —
// so the files a mentor drops on the session reach every lesson in it
// EXCEPT these.
export const isAssignmentLesson = (title) => /^assignment\b/i.test(String(title || '').trim());
// Generalist files its weekly assignment as a whole chapter ("Weekly
// assignment: …", with Brief and Submission pages), so the same exception
// has to be judged on the chapter as well as the lesson.
export const isAssignmentChapter = (title) => /\bassignments?\b/i.test(String(title || ''));

// Kickstarter files its portfolio projects as "P01 · …" LESSONS inside the
// session that sets them; Generalist as "Milestone Project 1 · …" CHAPTERS,
// the same shape its weekly assignment takes. Hence one test each level.
export const isProjectLesson = (title) => /^P\d+\s*[·.:-]/.test(String(title || '').trim());
export const isProjectChapter = (title) => /^milestone project\b/i.test(String(title || '').trim());

// Is this a piece of work a student hands in, and which kind? Judged on the
// lesson first and then on the chapter holding it, because the two curricula
// file the same thing at different levels.
export const workKind = ({ lesson, chapter } = {}) => {
  if (isAssignmentLesson(lesson)) return 'assignment';
  if (isProjectLesson(lesson)) return 'project';
  if (isAssignmentChapter(chapter)) return 'assignment';
  if (isProjectChapter(chapter)) return 'project';
  return null;
};

// What the two PDF chips are called. On a lesson they are the week's ebook and
// what the mentor put up after class. On a piece of work they are neither:
// the "reading" is the brief you are marked against and the "notes" are the
// solution book, and calling those two Reading material and Teacher notes
// sends a student looking for a brief they are already holding.
// `notesMany` is the plural, spelled out rather than derived: "teacher notes"
// is already plural and "2 teacher notess" is what adding an s to it gets you.
const LABELS = {
  assignment: { reading: 'Assignment brief', notes: 'Solution brief', notesMany: 'solution briefs', noReading: 'No brief yet', noNotes: 'No solution yet' },
  project: { reading: 'Project brief', notes: 'Project solution', notesMany: 'project solutions', noReading: 'No project brief yet', noNotes: 'No project solution yet' },
  lesson: { reading: 'Reading material', notes: 'Teacher notes', notesMany: 'teacher notes', noReading: 'No reading yet', noNotes: 'No notes yet' },
};
export const materialLabels = (kind) => LABELS[kind] || LABELS.lesson;
