// Load .env FIRST so every module below sees process.env at import time.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import mongoose from 'mongoose';
import crypto from 'crypto';

import { connectDb } from './db.js';
import routes from './routes/index.js';

const app = express();
const port = Number(process.env.PORT || 4100); // 4100 avoids clashing with the marketing API (4000) in local dev.

// The API runs behind a TLS-terminating proxy in production, so req.protocol and
// req.ip are only truthful once the forwarding headers are trusted.
app.set('trust proxy', 1);

// ── Request id + access log ──────────────────────────────────────────────────
// Every log line and every error response carries the same id, so a student
// saying "it failed at 3pm" turns into one grep instead of a guess. Mounted
// first so even a rejected CORS preflight is traceable.
const isProd = process.env.NODE_ENV === 'production';
// One line of JSON in production (Render ships stdout to its log search, which
// can filter on fields); something readable in a dev terminal.
const log = (level, fields) => {
  if (isProd) {
    console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, t: new Date().toISOString(), ...fields }));
    return;
  }
  const { msg, ...rest } = fields;
  const tail = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(' ');
  console[level === 'error' ? 'error' : 'log'](`[${level}] ${msg || ''} ${tail}`.trim());
};

app.use((req, res, next) => {
  // An inbound id is honoured so a trace survives across services, but it is
  // going into log lines — cap it and drop anything that isn't id-shaped so a
  // caller can't inject newlines or a fake JSON field.
  const given = String(req.get('x-request-id') || '').replace(/[^\w.-]/g, '').slice(0, 64);
  req.id = given || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  // The platform health check fires constantly; logging it buries everything else.
  if (req.path === '/health') return next();

  // Captured here, not in the finish handler: Express rewrites req.url as a
  // request descends into each mounted router, so by the time 'finish' fires
  // req.path has been reduced to the fragment the innermost router saw — "/"
  // for most real requests. req.originalUrl is never mutated. The query string
  // is dropped rather than logged: reset tokens and emails ride in there.
  const path = req.originalUrl.split('?')[0];

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    log(res.statusCode >= 500 ? 'error' : 'info', {
      msg: 'req',
      id: req.id,
      method: req.method,
      path,
      status: res.statusCode,
      ms: Math.round(ms),
      user: req.user?._id ? String(req.user._id) : '-',
      ip: req.ip,
    });
  });
  next();
});

// Security headers, set by hand rather than pulling in a library — this is a
// JSON API with no HTML views to protect, so the handful that actually apply
// here is small. Same house style as the by-hand headers already on the
// resume-download route (see routes/uploads.js).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  // Only meaningful over HTTPS, which is how Render serves this — a browser
  // ignores it on plain HTTP, so it's a no-op in local dev.
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// CORS allowlist — the LMS frontend (app.menler.in / localhost:5174) calls this
// API cross-origin. Bearer tokens (no cookies) keep this simple.
const normalizeOrigin = (s) => (s || '').trim().replace(/\/+$/, '');
const allowedOrigins = new Set(
  [process.env.LMS_APP_URL, 'http://localhost:5174', 'https://app.menler.in']
    .flatMap((v) => (v ? v.split(',') : []))
    .map(normalizeOrigin)
    .filter(Boolean),
);

// Gzip every response big enough to be worth it. Students on mobile data are the
// point here, not server headroom -- the dashboard/search payloads are chunky JSON.
app.use(compression());

// Keep the raw body so the Zoom webhook can verify its HMAC signature.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) return cb(null, true);
      return cb(null, false);
    },
    // Without this the browser hides the header, and the id in the error body
    // is the only one a student can quote back to support.
    exposedHeaders: ['X-Request-Id'],
    // Every request carries an Authorization header, which makes it a
    // "non-simple" CORS request and earns it an OPTIONS preflight. Chrome's
    // default cache for that is ~5 seconds, so the preflight was being re-asked
    // for practically every call — a wasted round-trip each time, which is
    // free on localhost and very much not free from a phone to Render. 24h is
    // the maximum Chrome honours.
    maxAge: 86400,
  }),
);

// A platform health check gates traffic/restarts on this — it must actually
// reflect whether the app can serve requests, not just that the process is
// running. readyState 1 = connected; anything else means Mongo is down.
app.get('/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ ok: dbUp, db: mongoose.connection.readyState });
});
app.use('/api/lms', routes);

// Express's built-in 404 answers with an HTML page. api() in the client parses
// every response as JSON, so a typo'd path surfaced as a parse error rather
// than a 404. Same reasoning as the error handler below.
app.use((req, res) => res.status(404).json({ error: 'Not found.', requestId: req.id }));

// Terminal error handler. Express 5 forwards a rejected async handler here on
// its own, which is what makes this the one place every unexpected failure
// passes through — before this, a route that threw logged nothing and replied
// with an HTML stack page. Four params: that arity is what marks it as the
// error handler, so the unused `next` has to stay.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  log(status >= 500 ? 'error' : 'info', {
    msg: 'unhandled',
    id: req.id,
    method: req.method,
    path: req.originalUrl.split('?')[0], // see the access log above — req.path is router-relative
    status,
    err: err.message,
    // The stack is the entire point of logging this; it never goes in the body.
    stack: status >= 500 ? err.stack : undefined,
  });
  if (res.headersSent) return res.end();
  // A 500's message can name a collection or a connection string — the client
  // gets the id to quote, and the detail stays in the log.
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on our end.' : err.message,
    requestId: req.id,
  });
});

// Nothing outside a request reaches the handler above. Log these rather than
// letting the process die mute — Render restarts it either way, and an
// unexplained restart is the hardest kind of incident to chase.
process.on('unhandledRejection', (reason) => {
  log('error', { msg: 'unhandledRejection', err: reason?.message || String(reason), stack: reason?.stack });
});
process.on('uncaughtException', (err) => {
  log('error', { msg: 'uncaughtException', err: err.message, stack: err.stack });
  // State is unknowable after this — drain and let the platform bring up a
  // fresh instance rather than serving from a process we can't reason about.
  shutdown('uncaughtException');
});

// Render moves traffic to the new instance, then sends SIGTERM to this one and
// SIGKILLs it if it's still alive after the grace period. With no handler Node
// exits the instant the signal lands and every request still being served dies
// with it — including a submission sitting mid Drive-verification. Draining is
// the difference between a clean deploy and a burst of 502s.
let server;
let shuttingDown = false;
const SHUTDOWN_GRACE_MS = 25_000; // comfortably inside Render's 30s before SIGKILL

function shutdown(signal) {
  if (shuttingDown) return; // a second signal shouldn't start a second drain
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, draining in-flight requests`);

  if (!server) {
    console.log('[shutdown] not listening yet, exiting');
    process.exit(0);
  }

  // Exit on our own terms rather than waiting to be killed if something hangs.
  const forceExit = setTimeout(() => {
    console.error('[shutdown] grace period elapsed, forcing exit');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref();

  // Stop accepting new connections, and drop idle keep-alives so the drain
  // isn't held open by browsers that are merely holding a socket. Requests
  // actually in flight are left alone to finish.
  server.closeIdleConnections();
  server.close(async (err) => {
    if (err) console.error('[shutdown] http close failed:', err.message);
    try {
      await mongoose.connection.close();
    } catch (e) {
      console.error('[shutdown] mongo close failed:', e.message);
    }
    console.log('[shutdown] drained cleanly');
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function start() {
  try {
    await connectDb();
    server = app.listen(port, () => console.log(`Menler LMS API listening on http://localhost:${port}`));
  } catch (err) {
    console.error('Failed to start LMS server:', err);
    process.exit(1);
  }
}

start();
