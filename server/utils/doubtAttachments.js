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
// They are also not PDFs. Nine times in ten the useful thing is a screenshot,
// so images are the point rather than a concession.

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;

// The browser reports whatever the OS told it, so the declared type decides
// nothing — the bytes do. Each entry is the signature we require before we are
// willing to serve the file back with that Content-Type.
const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 1024).includes('%PDF-') },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', ext: 'gif', test: (b) => b.subarray(0, 6).toString('latin1').startsWith('GIF8') },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** What these bytes actually are, or null if we will not take them. */
export function sniffAttachment(file) {
  const buf = file?.buffer;
  if (!buf || buf.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buf))?.mime || null;
}

/** The list a file picker offers, and the sentence an upload is refused with. */
export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp';
export const ATTACHMENT_REFUSAL = 'Attach a screenshot (PNG, JPG, GIF or WebP) or a PDF.';

/**
 * Store one multer file as a doubt attachment. Never reuses an existing row:
 * see the note above. Returns the shape kept on the booking.
 */
export async function storeDoubtAttachment(file, ownerId, mimeType) {
  const asset = await FileAsset.create({
    data: file.buffer,
    name: file.originalname || 'attachment',
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
