import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';

// Local-disk uploads (resumes, submission files). Files are written to ./uploads
// and served statically at /uploads (see index.js).
// NOTE: on ephemeral hosts (e.g. Render free tier) the disk is wiped on redeploy
// — for durable storage, swap this for S3/Cloudinary later.
const dir = 'uploads';
fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dir),
  filename: (_req, file, cb) => cb(null, crypto.randomBytes(8).toString('hex') + path.extname(file.originalname || '')),
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } }); // 8 MB

const router = Router();

// POST /api/lms/uploads  (multipart, field "file") — returns a public URL.
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const base = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  res.status(201).json({ url: `${base.replace(/\/+$/, '')}/uploads/${req.file.filename}`, name: req.file.originalname });
});

export default router;
