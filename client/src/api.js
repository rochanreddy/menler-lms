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
}
