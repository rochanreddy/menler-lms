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
