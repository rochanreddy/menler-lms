import { FileAsset } from '../models/FileAsset.js';

// Files a student attaches to their doubt-session booking: the screenshot of
// the error, the notebook that will not run, the brief they are arguing with.
//
// These are EPHEMERAL, which is the whole reason they do not go through
// `storeCurriculumPdf`. That helper deduplicates on the content hash so one
// ebook dropped onto twenty lessons is one row — exactly the right call for
// course material, and exactly the wrong one here: a shared row cannot be
// deleted when one session ends without emptying whatever else points at it.
// So an attachment is always its own row, stored once, deleted outright.
//
// Nine times in ten the useful thing is a screenshot, so images are the point
// rather than a concession. The tenth is the document itself — the Word draft,
// the sheet whose formula is wrong, the deck, the notebook — and describing a
// document you could have attached is the slowest way to ask about it.

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const TEXT = 'text/plain; charset=utf-8';

const utf16 = (s) => Buffer.from(s, 'utf16le');

// Office 2007+ is a zip. Its part names are stored uncompressed in the zip
// headers, so which program made it can be read without unzipping. A zip that
// is not an Office document is refused, and so is one carrying a VBA project
// (.docm, .xlsm, .pptm renamed to .docx): the admin opens these in Office, and
// a macro is the one thing in a document that runs.
function sniffOoxml(b) {
  if (!b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return null;
  if (!b.includes('[Content_Types].xml') || b.includes('vbaProject.bin')) return null;
  if (b.includes('word/')) return DOCX;
  if (b.includes('xl/')) return XLSX;
  if (b.includes('ppt/')) return PPTX;
  return null;
}

// Office 97–2003 (.doc/.xls/.ppt) is an OLE compound file; the stream names in
// its directory are UTF-16 and say which program wrote it. `_VBA_PROJECT` is
// the stream every macro-carrying one has, and it is refused for the reason
// above. Any other OLE file (an .msi, a .msg) names none of these streams.
function sniffOle(b) {
  if (!b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return null;
  if (b.includes(utf16('_VBA_PROJECT'))) return null;
  if (b.includes(utf16('WordDocument'))) return 'application/msword';
  if (b.includes(utf16('Workbook'))) return 'application/vnd.ms-excel';
  if (b.includes(utf16('PowerPoint Document'))) return 'application/vnd.ms-powerpoint';
  return null;
}

// The browser reports whatever the OS told it, so the declared type decides
// nothing — the bytes do. Each entry is the signature we require before we are
// willing to serve the file back with that Content-Type.
const SIGNATURES = [
  { test: (b) => (b.subarray(0, 1024).includes('%PDF-') ? 'application/pdf' : null) },
  { test: (b) => (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png' : null) },
  { test: (b) => (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg' : null) },
  { test: (b) => (b.subarray(0, 6).toString('latin1').startsWith('GIF8') ? 'image/gif' : null) },
  {
    test: (b) => (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
      ? 'image/webp' : null),
  },
  { test: sniffOoxml },
  { test: sniffOle },
];

// Plain text has no signature, so it is the one case where the name is
// consulted — and only to allow, never to label: whatever it is called, it is
// served back as text/plain, which a browser shows and never runs. It must
// also BE text: valid UTF-8 with no NUL, which no executable or archive is.
const TEXT_EXT = /\.(txt|md|csv|json|ipynb|py|js|ts|sql|log)$/i;

function isText(file) {
  if (!TEXT_EXT.test(file.originalname || '')) return false;
  const b = file.buffer;
  if (b.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); return true; } catch { return false; }
}

/** What these bytes actually are, or null if we will not take them. */
export function sniffAttachment(file) {
  const buf = file?.buffer;
  if (!buf?.length) return null;
  if (buf.length >= 12) {
    for (const s of SIGNATURES) {
      const mime = s.test(buf);
      if (mime) return mime;
    }
  }
  return isText(file) ? TEXT : null;
}

// The extension the admin's computer will use to pick a program. A Word file
// uploaded as "notes" or "notes.exe" is saved as "notes.docx", so the name can
// never argue with the bytes.
const EXT = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  [DOCX]: ['docx'],
  [XLSX]: ['xlsx'],
  [PPTX]: ['pptx'],
  'application/msword': ['doc'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.ms-powerpoint': ['ppt'],
};

export function attachmentName(name, mime) {
  const base = String(name || 'attachment').trim() || 'attachment';
  const want = EXT[mime];
  if (!want) return base; // text: its own extension is what let it in
  const has = /\.([a-z0-9]+)$/i.exec(base)?.[1]?.toLowerCase();
  return want.includes(has) ? base : `${base}.${want[0]}`;
}

/** The list a file picker offers, and the sentence an upload is refused with. */
export const ATTACHMENT_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.ipynb,.py,.js,.ts,.sql,.log';
export const ATTACHMENT_REFUSAL =
  'Attach a screenshot, a PDF, a Word, Excel or PowerPoint file, or a text or code file. Files with macros are not accepted.';

/**
 * Store one multer file as a doubt attachment. Never reuses an existing row:
 * see the note above. Returns the shape kept on the booking.
 */
export async function storeDoubtAttachment(file, ownerId, mimeType) {
  const asset = await FileAsset.create({
    data: file.buffer,
    name: attachmentName(file.originalname, mimeType),
    // OUR reading of the bytes, not the browser's claim — this is the value
    // `GET /uploads/:id` hands back as the Content-Type.
    mimeType,
    size: file.size,
    ownerId,
    kind: 'doubt-attachment',
    // Left empty on purpose. `hash` is what makes a row shareable, and a
    // shareable row is one this code must never delete.
    hash: '',
  });
  return { url: `/uploads/${asset._id}`, name: asset.name, mimeType, size: asset.size };
}

/**
 * Delete the stored bytes behind a list of attachment entries, wherever they
 * are being dropped from — a slot given back, a cancelled session, the sweep.
 *
 * Scoped to `kind: 'doubt-attachment'` so a url that somehow names a lesson's
 * ebook cannot take the ebook with it. Returns how many rows went.
 */
export async function dropAttachments(attachments = []) {
  const ids = attachments
    .map((a) => /^\/uploads\/([a-f0-9]{24})$/i.exec(a?.url || '')?.[1])
    .filter(Boolean);
  if (!ids.length) return 0;
  const r = await FileAsset.deleteMany({ _id: { $in: ids }, kind: 'doubt-attachment' });
  return r.deletedCount || 0;
}
