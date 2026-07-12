// Thin fetch wrapper — this is the ENTIRE link between the frontend and the
// backend: it sends requests to VITE_API_URL with the stored Bearer token.
const API = (import.meta.env.VITE_API_URL || 'http://localhost:4100/api/lms').replace(/\/+$/, '');

export function getToken() {
  return localStorage.getItem('lms_token') || '';
}
export function setToken(t) {
  if (t) localStorage.setItem('lms_token', t);
  else localStorage.removeItem('lms_token');
}

export async function api(path, { method = 'GET', body } = {}) {
  let lastErr;
  // Retry transient NETWORK failures (connection reset before the request lands —
  // common on localhost). HTTP error responses are NOT retried. All our writes
  // are idempotent, so a retry is safe.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    } catch (e) {
      // An HTTP error we generated above → don't retry, surface it.
      if (/^Request failed/.test(e.message || '')) throw e;
      lastErr = e; // network error → retry
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// POST a File (multipart, field "file") to any endpoint → parsed JSON.
export async function postFile(path, file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// Upload a File → returns { url, name }. Used for resume/submissions.
export const uploadFile = (file) => postFile('/uploads', file);
