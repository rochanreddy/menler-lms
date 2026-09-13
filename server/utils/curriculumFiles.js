import { FileAsset } from '../models/FileAsset.js';
import { sha256 } from './curriculumPdfAssets.js';

// Storing a course PDF, shared by the two routes that accept one: the single
// drop in the curriculum editor (routes/uploads.js) and the multi-file push
// onto a week, session or lesson (routes/programs.js). Both must land on the
// same row for the same bytes, so the hash lookup lives here rather than in
// either route.

export const MAX_CURRICULUM_BYTES = 15 * 1024 * 1024;
const PDF_TYPE = 'application/pdf';
const PDF_EXT = /\.pdf$/i;

// Declared type or extension AND the bytes themselves: a browser reports
// whatever the OS told it, and a mentor renaming a .docx to .pdf would
// otherwise hand every student a file the reader cannot open. The header may
// sit behind a few bytes of junk, which the spec allows within the first 1 KB.
const looksLikePdf = (buf) => !!buf && buf.subarray(0, 1024).includes('%PDF-');
export const isPdfUpload = (file) =>
  (file.mimetype === PDF_TYPE || PDF_EXT.test(file.originalname || '')) && looksLikePdf(file.buffer);

/**
 * Store one multer file as a curriculum PDF, reusing an existing row when the
 * same bytes are already there. Returns { url, name, reused }.
 */
export async function storeCurriculumPdf(file, ownerId) {
  const hash = sha256(file.buffer);
  const seen = await FileAsset.findOne({ kind: 'curriculum-pdf', hash }).sort({ createdAt: 1 }).select('_id name');
  if (seen) return { url: `/uploads/${seen._id}`, name: file.originalname || seen.name, reused: true };
  const asset = await FileAsset.create({
    data: file.buffer,
    name: file.originalname || 'document.pdf',
    mimeType: file.mimetype || PDF_TYPE,
    size: file.size,
    hash,
    ownerId,
    kind: 'curriculum-pdf',
  });
  return { url: `/uploads/${asset._id}`, name: asset.name, reused: false };
}
