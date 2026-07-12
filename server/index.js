// Load .env FIRST so every module below sees process.env at import time.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';

import { connectDb } from './db.js';
import routes from './routes/index.js';

const app = express();
const port = Number(process.env.PORT || 4100); // 4100 avoids clashing with the marketing API (4000) in local dev.

// CORS allowlist — the LMS frontend (app.menler.in / localhost:5174) calls this
// API cross-origin. Bearer tokens (no cookies) keep this simple.
const normalizeOrigin = (s) => (s || '').trim().replace(/\/+$/, '');
const allowedOrigins = new Set(
  [process.env.LMS_APP_URL, 'http://localhost:5174', 'https://app.menler.in']
    .flatMap((v) => (v ? v.split(',') : []))
    .map(normalizeOrigin)
    .filter(Boolean),
);

// Keep the raw body so the Zoom webhook can verify its HMAC signature.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) return cb(null, true);
      return cb(null, false);
    },
  }),
);

app.get('/health', (_req, res) => res.json({ ok: true }));
// Serve uploaded files (resumes, submissions). CORS-open so links open anywhere.
app.use('/uploads', (req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); }, express.static('uploads'));
app.use('/api/lms', routes);

async function start() {
  try {
    await connectDb();
    app.listen(port, () => console.log(`Menler LMS API listening on http://localhost:${port}`));
  } catch (err) {
    console.error('Failed to start LMS server:', err);
    process.exit(1);
  }
}

start();
