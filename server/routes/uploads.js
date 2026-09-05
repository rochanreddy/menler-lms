import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { FileAsset } from '../models/FileAsset.js';

// Resume upload + read-back, and curriculum PDFs from the admin editor.
// Bytes go to Mongo (see models/FileAsset.js), never to disk, and they are
// served back through this authenticated route rather than a static mount.

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const MAX_CURRICULUM_BYTES = 15 * 1024 * 1024;

// What the Profile file picker offers (.pdf/.doc/.docx). Browsers disagree about
// the exact type they report for Office formats, so the extension is accepted as
// a fallback when the reported type is generic.
const RESUME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const RESUME_EXT = /\.(pdf|doc|docx)$/i;
const PDF_TYPE = 'application/pdf';
const PDF_EXT = /\.pdf$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CURRICULUM_BYTES },
});

// Header-safe filename: no quotes, no newlines, nothing that could split headers.
const safeName = (s) => String(s || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120);

const router = Router();

// POST /api/lms/uploads  (multipart, field "file", optional field "kind")
// kind=curriculum-pdf → admin/mentor only, PDF only, up to 15 MB.
// Default → resume, PDF/Word, up to 5 MB.
// Returns a ROOT-RELATIVE url. Nothing host-shaped is ever persisted, so the
// stored value survives a domain change and can't be written as http:// by a
// proxy that terminated TLS upstream.
router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? 'That file is over the 15 MB limit.' : 'Upload failed.',
      });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const kind = req.body?.kind === 'curriculum-pdf' ? 'curriculum-pdf' : 'resume';

    if (kind === 'curriculum-pdf') {
      if (!['admin', 'mentor'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Not allowed.' });
      }
      const okPdf = req.file.mimetype === PDF_TYPE || PDF_EXT.test(req.file.originalname || '');
      if (!okPdf) return res.status(415).json({ error: 'Only PDF files are accepted.' });
    } else {
      const okType = RESUME_TYPES.has(req.file.mimetype) || RESUME_EXT.test(req.file.originalname || '');
      if (!okType) return res.status(415).json({ error: 'Only PDF and Word documents are accepted.' });
      if (req.file.size > MAX_RESUME_BYTES) {
        return res.status(413).json({ error: 'That file is over the 5 MB limit.' });
      }
    }

    try {
      const asset = await FileAsset.create({
        data: req.file.buffer,
        name: req.file.originalname || (kind === 'curriculum-pdf' ? 'document.pdf' : 'resume'),
        mimeType: req.file.mimetype || (kind === 'curriculum-pdf' ? PDF_TYPE : 'application/octet-stream'),
        size: req.file.size,
        ownerId: req.user._id,
        kind,
      });
      return res.status(201).json({ url: `/uploads/${asset._id}`, name: asset.name });
    } catch {
      return res.status(500).json({ error: 'Could not store the file.' });
    }
  });
});

// GET /api/lms/uploads/:id
// Resumes: owner or admin. Curriculum PDFs: any signed-in user (course material).
router.get('/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });

  const asset = await FileAsset.findById(req.params.id).select('+data');
  if (!asset) return res.status(404).json({ error: 'Not found.' });

  if (asset.kind === 'resume') {
    const isOwner = String(asset.ownerId) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin') return res.status(403).json({ error: 'Not allowed.' });
  }

  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Length', asset.size);
  res.setHeader('Content-Disposition', `inline; filename="${safeName(asset.name)}"`);
  // Never let a browser sniff its way to executing one of these.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(asset.data);
});

export default router;
