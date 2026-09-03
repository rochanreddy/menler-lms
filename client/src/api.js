// Thin fetch wrapper — this is the ENTIRE link between the frontend and the
// backend: it sends requests to VITE_API_URL with the stored Bearer token.
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4100/api/lms').replace(/\/+$/, '');

const ACCESS_KEY = 'lms_token';
const REFRESH_KEY = 'lms_refresh';

export function getToken() {
  return localStorage.getItem(ACCESS_KEY) || '';
}
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY) || '';
}

/**
 * Store the session.
 *
 * A falsy access token clears BOTH tokens — that is what logout does, and it is
 * why every existing `setToken('')` call still means exactly what it always did.
 *
 * Omitting `refresh` leaves the stored refresh token untouched. That is what a
 * silent token refresh wants: the server hands back a fresh access token and
 * keeps the same 30-day refresh token.
 */
export function setToken(t, refresh) {
  if (!t) {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    return;
  }
  localStorage.setItem(ACCESS_KEY, t);
  if (refresh === undefined) return;
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  else localStorage.removeItem(REFRESH_KEY);
}

// A page mount fires several requests at once (StudentHome sends eight). When the
// access token expires they all 401 together, and without this they would each
// POST /auth/refresh. One refresh, however many callers are waiting on it.
let refreshInFlight = null;

/** Trade the refresh token for a new access token. Resolves to the token, or null. */
function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  const stored = getRefreshToken();
  if (!stored) return Promise.resolve(null);

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.accessToken) {
        setToken(data.accessToken); // refresh token left alone — the server doesn't rotate it
        return data.accessToken;
      }
      // Blocked mid-session: show the stop page, which says why, rather than
      // bouncing the user to a login screen that would just reject them again.
      if (data.code === 'blocked') {
        window.dispatchEvent(new CustomEvent('lms:blocked', { detail: { message: data.error } }));
        return null;
      }
      // The refresh token is genuinely dead (30 days elapsed, or the account went).
      setToken('');
      window.dispatchEvent(new CustomEvent('lms:signed-out'));
      return null;
    } catch {
      // Network failure — the session may be perfectly fine, so don't destroy it.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** One request, with the network-failure retry. Returns the response + parsed body. */
async function send(path, method, body) {
  let lastErr;
  // Retry transient NETWORK failures (connection reset before the request lands —
  // common on localhost). HTTP error responses are NOT retried. Only GET is
  // retried: a write can fail on the network AFTER the server has already
  // processed it, and several of ours aren't safe to repeat blind (a doubts
  // post, a like toggle, a one-shot quiz attempt) — a failing write surfaces
  // to the caller instead, which already handles that.
  const attempts = method === 'GET' ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { res, data: await res.json().catch(() => ({})) };
    } catch (e) {
      lastErr = e; // network error → retry
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function api(path, { method = 'GET', body } = {}) {
  let { res, data } = await send(path, method, body);

  // The access token expired. Swap it for a fresh one and replay the request once,
  // so the user never sees the seam. Skipped for /auth/* — a 401 from login is a
  // wrong password, not a stale token, and refreshing the refresh call would loop.
  if (res.status === 401 && !path.startsWith('/auth/') && getRefreshToken()) {
    if (await refreshAccessToken()) ({ res, data } = await send(path, method, body));
  }

  if (!res.ok) {
    // Admin blocked this account mid-session → tell the app shell so it can
    // swap to the "account blocked" screen instead of a dead error toast.
    if (data.code === 'blocked') {
      window.dispatchEvent(new CustomEvent('lms:blocked', { detail: { message: data.error } }));
    }
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.code = data.code;
    throw err;
  }
  return data;
}

// Bearer-authenticated fetch for the binary endpoints, with the same replay: a
// stale token must not turn "open my resume" into a silent failure.
async function authedFetch(path, init = {}) {
  const fire = () => fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  let res = await fire();
  if (res.status === 401 && getRefreshToken() && (await refreshAccessToken())) res = await fire();
  return res;
}

// POST a File (multipart, field "file") to any endpoint → parsed JSON.
export async function postFile(path, file) {
  const fd = new FormData();
  fd.append('file', file);
  // No Content-Type header: the browser has to set the multipart boundary itself.
  const res = await authedFetch(path, { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// Upload a File → returns { url, name }. Used for resume/submissions.
export const uploadFile = (file) => postFile('/uploads', file);

// A resume field holds either a link the user pasted or a file we stored. Only
// the second kind needs a token to read, so the two render differently.
export const isStoredFile = (url) => /^\/uploads\//.test(url || '');

// Open one of our stored files in a new tab. It sits behind requireAuth, so a
// plain <a href> would 401 -- the bytes have to be fetched with the token and
// handed to the browser as a blob.
export async function openStoredFile(path) {
  const res = await authedFetch(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not open that file.');
  }
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  // The tab has the blob by now; releasing the handle keeps it out of memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}


// ── VdoCipher lesson videos, per batch ──────────────────────────────────────
// Videos are uploaded in VdoCipher's own dashboard; here they are only listed,
// attached to a lesson for one batch, and played back through a short-lived OTP.

/** The VdoCipher library (staff only) — for the "pick a video" dialog. */
export const listVdoCipherVideos = (q = '', page = 1) =>
  api(`/lesson-videos/library?q=${encodeURIComponent(q)}&page=${page}`);

/** Lesson→video mappings for one batch, or across the viewer's own batches. */
export const getLessonVideos = (batchId) =>
  api(`/lesson-videos${batchId ? `?batchId=${batchId}` : ''}`);

export const setLessonVideo = (batchId, topicId, videoId, title) =>
  api(`/lesson-videos/${batchId}/${topicId}`, { method: 'PUT', body: { videoId, title } });

export const clearLessonVideo = (batchId, topicId) =>
  api(`/lesson-videos/${batchId}/${topicId}`, { method: 'DELETE' });

/** Short-lived OTP + playbackInfo for the DRM player iframe. */
export const getLessonVideoOtp = (batchId, topicId) =>
  api(`/lesson-videos/${batchId}/${topicId}/otp`);

// Download an authenticated file (CSV reports) and trigger a browser save.
export async function downloadFile(path, fallbackName = 'report.csv') {
  const res = await authedFetch(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
