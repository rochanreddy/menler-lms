// Thin wrapper around VdoCipher's REST API. Videos are uploaded in VdoCipher's
// own dashboard; this service only ever (1) reads the library so an admin can
// pick a video, and (2) mints a short-lived OTP so an authorised viewer's
// browser can load the DRM player. The API secret never leaves the server.

const BASE = 'https://dev.vdocipher.com/api';

function authHeader() {
  const secret = process.env.VDOCIPHER_API_SECRET;
  if (!secret) throw new Error('VDOCIPHER_API_SECRET is not configured.');
  return `Apisecret ${secret}`;
}

/** The account's video library, newest first. `q` searches id + title.
 *  VdoCipher caps `limit` at 40. Returns { count, rows }. */
export async function listVideos({ q = '', page = 1, limit = 40 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(Math.min(limit, 40)) });
  if (q) params.set('q', q);
  const res = await fetch(`${BASE}/videos?${params}`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`VdoCipher video listing failed (${res.status}).`);
  return res.json(); // { count, rows: [{ id, title, length, status, posters, ... }] }
}

/** A short-lived OTP + playbackInfo pair for the v2 player iframe. */
export async function getOtp(videoId, ttl = 300) {
  const res = await fetch(`${BASE}/videos/${videoId}/otp`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl }),
  });
  if (!res.ok) throw new Error(`VdoCipher OTP request failed (${res.status}).`);
  return res.json(); // { otp, playbackInfo }
}
