// Verifies a Google Drive folder a student submitted, using the Drive REST
// API directly with a server-side API key (public-file checks only — no
// OAuth, since we only ever need to read metadata on files the student has
// already made link-shareable).
//
// Ported 1:1 from the checks the previous Apps-Script version ran: resolve
// the folder, confirm it's actually a folder (not a file), list its
// contents, reject anything private or dangerous, require at least one of
// each configured file type, and only then return the file list to store.

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'zip', 'sh', 'js', 'apk', 'bat', 'cmd', 'msi', 'jar',
  'dll', 'com', 'scr', 'vbs', 'ps1', 'app', 'deb', 'rpm', 'dmg', '7z', 'rar', 'iso',
]);

// HTML is dangerous by default (it can carry scripts), but a mentor can
// legitimately ask for a web page as the deliverable. So it's blocked unless
// the assignment opts in — an opt-in relaxation, never a global one.
//
// Opting in is `allowHtml`, which is separate from requiring an .html file.
// It used to be the same flag: listing 'html' in requiredDriveTypes was the
// only way to accept one, and it also made one mandatory. That is wrong for
// the six Kickstarter assignments whose deliverable is a Claude Artifact,
// because an Artifact arrives just as often as a PDF export or a shared link,
// and demanding the .html rejected work that was perfectly complete.
const HTML_EXTENSIONS = new Set(['html', 'htm']);

const DOC_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.document',
  'text/plain',
]);

const DOC_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'rtf', 'md']);

const SLIDES_MIME_TYPES = new Set([
  'application/vnd.google-apps.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
]);

const SLIDES_EXTENSIONS = new Set(['ppt', 'pptx', 'key', 'odp']);

// Human-readable names for the "you're missing X" message.
const TYPE_LABELS = {
  video: 'a video',
  image: 'a photo/screenshot',
  doc: 'a document (PDF, Word or text file)',
  slides: 'a slide deck (PPT)',
  html: 'an HTML file',
};

// Google hands out more shapes of share link than the folder URL we ask for,
// and a student who pastes the wrong one deserves to be told WHICH wrong one
// it is. So this parses rather than tests: the commonest mistake by far is
// "Copy link" on a document or a file, which gives /file/d/… or
// docs.google.com/document/d/… — neither carries /folders/, so both used to
// come back as "that does not look like a valid Drive link", which reads as
// "your link is broken" to someone whose link opens perfectly well.
//
// It is also forgiving about the paste itself. A link arrives from WhatsApp
// or the Drive app wrapped in spaces, angle brackets or a trailing full stop,
// and a scheme-less "drive.google.com/…" is still a Drive link; none of that
// is the student getting it wrong.
const FILE_PATH_RE = /\/(?:file|document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]+)/;

export function parseDriveLink(driveLink) {
  const none = { kind: null, id: null };
  const raw = String(driveLink || '').trim().replace(/^<+|>+$/g, '').replace(/[.,;)\]]+$/, '');
  if (!raw) return none;

  let url;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return none; }
  if (!/(^|\.)(drive|docs)\.google\.com$/.test(url.hostname)) return none;

  // /drive/folders/…, /drive/u/0/folders/…, /drive/mobile/folders/… all match.
  const folder = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folder) return { kind: 'folder', id: folder[1] };

  const file = url.pathname.match(FILE_PATH_RE);
  if (file) return { kind: 'file', id: file[1] };

  // Legacy /open?id=… names either a file or a folder; the metadata call
  // below is what settles it.
  const qid = url.searchParams.get('id');
  if (qid) return { kind: 'unknown', id: qid };

  return none;
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

function classifyFile(name, mimeType, { allowHtml = false } = {}) {
  const ext = extOf(name);
  if (DANGEROUS_EXTENSIONS.has(ext)) return 'dangerous';
  if (HTML_EXTENSIONS.has(ext) || mimeType === 'text/html') return allowHtml ? 'html' : 'dangerous';
  if ((mimeType || '').startsWith('video/')) return 'video';
  if ((mimeType || '').startsWith('image/')) return 'image';
  if (SLIDES_MIME_TYPES.has(mimeType) || SLIDES_EXTENSIONS.has(ext)) return 'slides';
  if (DOC_MIME_TYPES.has(mimeType) || DOC_EXTENSIONS.has(ext)) return 'doc';
  return 'other';
}

// A submission can make four of these calls in sequence, and fetch has no
// default timeout — so a Drive endpoint that accepts the connection and then
// stalls holds the student's request open until the platform proxy kills it
// with a 502, which reads as "the site is broken" rather than "the check
// failed". 8s is well past Drive's normal response and well inside any proxy
// timeout, so we fail on our own terms with a message they can act on.
const DRIVE_TIMEOUT_MS = 8000;

// …and a ceiling on the whole verification, because the per-call timeout does
// not bound the total: step 3 below makes one call PER FILE, so a folder with
// forty files could sit inside its per-call budget and still run for minutes.
const DRIVE_BUDGET_MS = 25000;

// A timed-out fetch reports "This operation was aborted", which tells a student
// nothing. Everything else keeps its real message — it goes to them verbatim.
const reachMsg = (err) =>
  (err?.name === 'TimeoutError' || err?.name === 'AbortError'
    ? 'Google Drive did not respond in time. This is usually temporary, try submitting again in a minute.'
    : err?.message || 'unknown error');

async function driveGet(path, apiKey) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${DRIVE_API}${path}${sep}key=${apiKey}`, {
    signal: AbortSignal.timeout(DRIVE_TIMEOUT_MS),
  });
  return res;
}

/**
 * verifyDriveFolder(driveLink, { requiredTypes, allowHtml }) -> { status, errorDetail, files }
 * status: 'READY' | 'NEEDS_FIXES' | 'CHECK_FAILED'
 */
export async function verifyDriveFolder(driveLink, { requiredTypes = ['image', 'doc'], allowHtml = false } = {}) {
  if (!driveLink || typeof driveLink !== 'string') {
    return { status: 'NEEDS_FIXES', errorDetail: 'A Drive folder link is required.', files: [] };
  }

  const { kind, id: folderId } = parseDriveLink(driveLink);
  if (kind === 'file') {
    return {
      status: 'NEEDS_FIXES',
      errorDetail: 'That link points to a single file (or a Google Doc), not to a folder. In Drive, put your work in a folder, open that folder, use Share → Copy link, and paste that link here.',
      files: [],
    };
  }
  if (!folderId) {
    return {
      status: 'NEEDS_FIXES',
      errorDetail: 'That does not look like a Google Drive link. It should start with https://drive.google.com/drive/folders/ — open your folder in Drive, use Share → Copy link, and paste the whole link.',
      files: [],
    };
  }

  const deadline = Date.now() + DRIVE_BUDGET_MS;

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return { status: 'CHECK_FAILED', errorDetail: 'Drive verification is not configured on the server (missing API key).', files: [] };
  }

  // 1. Folder metadata first — a restricted folder can return 200 + an empty
  // file list, so this is the only reliable way to detect "not public".
  let folderMeta;
  try {
    const res = await driveGet(`/files/${folderId}?fields=id,mimeType`, apiKey);
    if (res.status === 403 || res.status === 404) {
      return { status: 'NEEDS_FIXES', errorDetail: 'This Drive folder is not public. Set sharing to "Anyone with the link can view" and resubmit.', files: [] };
    }
    if (!res.ok) {
      return { status: 'CHECK_FAILED', errorDetail: `Drive API error while checking the folder (HTTP ${res.status}).`, files: [] };
    }
    folderMeta = await res.json();
  } catch (err) {
    return { status: 'CHECK_FAILED', errorDetail: `Could not reach Google Drive to verify the folder: ${reachMsg(err)}`, files: [] };
  }

  if (folderMeta.mimeType !== 'application/vnd.google-apps.folder') {
    return { status: 'NEEDS_FIXES', errorDetail: 'This link points to a file, not a folder. Submit a link to the folder containing your files.', files: [] };
  }

  // 2. List contents.
  let items;
  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await driveGet(`/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000`, apiKey);
    if (!res.ok) {
      return { status: 'CHECK_FAILED', errorDetail: `Drive API error while listing folder contents (HTTP ${res.status}).`, files: [] };
    }
    items = (await res.json()).files || [];
  } catch (err) {
    return { status: 'CHECK_FAILED', errorDetail: `Could not reach Google Drive to list folder contents: ${reachMsg(err)}`, files: [] };
  }

  if (items.length === 0) {
    return { status: 'NEEDS_FIXES', errorDetail: 'This Drive folder is empty. Add the files this assignment asks for, then resubmit.', files: [] };
  }

  // 3. Classify + check individual access. Dangerous files block outright;
  // private files block; everything else is collected.
  const dangerousNames = [];
  const privateNames = [];
  const files = [];
  // Required implies allowed: an assignment that demands an .html file plainly
  // permits one, whichever way the caller said it.
  const htmlOk = allowHtml || requiredTypes.includes('html');

  for (const item of items) {
    const type = classifyFile(item.name, item.mimeType || '', { allowHtml: htmlOk });
    if (type === 'dangerous') { dangerousNames.push(item.name); continue; }

    // One call per file, so this is where a big folder runs away.
    if (Date.now() > deadline) {
      return {
        status: 'CHECK_FAILED',
        errorDetail: `Checking this folder took too long (it has ${items.length} items). Remove anything that isn't part of the submission and try again.`,
        files: [],
      };
    }

    let fileMeta;
    try {
      const res = await driveGet(`/files/${item.id}?fields=id,webViewLink`, apiKey);
      if (res.status === 403 || res.status === 404) { privateNames.push(item.name); continue; }
      if (!res.ok) {
        return { status: 'CHECK_FAILED', errorDetail: `Drive API error while checking file "${item.name}" (HTTP ${res.status}).`, files: [] };
      }
      fileMeta = await res.json();
    } catch (err) {
      return { status: 'CHECK_FAILED', errorDetail: `Could not reach Google Drive to check file "${item.name}": ${reachMsg(err)}`, files: [] };
    }

    files.push({
      name: item.name,
      type,
      webViewLink: fileMeta.webViewLink || `https://drive.google.com/file/d/${item.id}/view`,
      mimeType: item.mimeType || '',
    });
  }

  if (dangerousNames.length) {
    return { status: 'NEEDS_FIXES', errorDetail: `Remove these disallowed file types before resubmitting: ${dangerousNames.join(', ')}.`, files: [] };
  }
  if (privateNames.length) {
    return { status: 'NEEDS_FIXES', errorDetail: `These files are not publicly viewable: ${privateNames.join(', ')}. Set them to "Anyone with the link can view".`, files: [] };
  }

  const present = new Set(files.map((f) => f.type));
  const missing = requiredTypes.filter((t) => !present.has(t));
  if (missing.length) {
    const names = missing.map((t) => TYPE_LABELS[t] || t);
    return { status: 'NEEDS_FIXES', errorDetail: `Your submission is missing ${names.join(', ')}.`, files: [] };
  }

  return { status: 'READY', errorDetail: null, files };
}
