// Pulls the actual *content* of a submitted Drive folder — the write-up text and
// the screenshot bytes — so utils/aiGrade.js has something to review.
//
// utils/driveVerify.js deliberately only reads metadata (does a doc exist? is it
// public?). This module goes one step further and downloads, so it is only ever
// called from the mentor-triggered review endpoint, never from the submit path.
//
// Files are downloaded with the same public-file + API-key approach as
// driveVerify: no OAuth, and it only works because the student already made the
// folder link-shareable.

import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// The vision models accept these four; anything else is skipped rather than
// sent and rejected.
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Guardrails so one oversized submission can't blow up a request. Screenshots
// past the cap are dropped (and counted, so the caller can say so).
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

// Submission.files stores webViewLink but not the raw Drive id. Every Drive URL
// carries the id in a /d/<id>/ segment, for both drive.google.com file links and
// docs.google.com native-doc links.
function driveIdFrom(webViewLink) {
  const m = String(webViewLink || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

async function download(fileId, apiKey, { exportMime = null } = {}) {
  const path = exportMime
    ? `/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`
    : `/files/${fileId}?alt=media`;
  const res = await fetch(`${DRIVE_API}${path}&key=${apiKey}`);
  if (!res.ok) throw new Error(`Drive download failed for ${fileId} (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// A Drive doc → plain text. Google-native Docs export directly as text; Word and
// PDF come down as bytes and go through the same parsers the curriculum importer
// uses. Anything else is read as UTF-8 and hoped for.
async function docToText(file, apiKey) {
  const id = driveIdFrom(file.webViewLink);
  if (!id) return '';

  if (file.mimeType === 'application/vnd.google-apps.document') {
    return (await download(id, apiKey, { exportMime: 'text/plain' })).toString('utf8');
  }

  const buf = await download(id, apiKey);
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (ext === 'docx' || file.mimeType.includes('wordprocessingml')) {
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    return html
      .replace(/<\/(p|h[1-6]|li|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (ext === 'pdf' || file.mimeType === 'application/pdf') {
    const { text } = await new PDFParse({ data: new Uint8Array(buf) }).getText();
    return (text || '').trim();
  }

  return buf.toString('utf8').trim();
}

/**
 * Gather everything reviewable from a verified submission.
 *
 * Returns { text, images, notes } where each image carries a data: URL ready to
 * drop into a chat message, and notes records what was skipped so the review can
 * say "3 screenshots were too large" instead of silently grading fewer.
 */
export async function collectSubmissionContent(submission) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) throw new Error('Drive access is not configured on the server (missing GOOGLE_DRIVE_API_KEY).');

  const files = submission.files || [];
  const notes = [];

  // ── Write-up text ──
  // Concatenate every doc in the folder; a student may split the write-up
  // across files, and the grader should see all of it.
  let text = (submission.text || '').trim();
  for (const file of files.filter((f) => f.type === 'doc')) {
    try {
      const extracted = await docToText(file, apiKey);
      if (extracted) text = text ? `${text}\n\n--- ${file.name} ---\n${extracted}` : extracted;
    } catch (err) {
      notes.push(`Could not read "${file.name}": ${err.message}`);
    }
  }
  if (text.length > MAX_TEXT_CHARS) {
    // Truncating changes what's graded, so it is always reported, never silent.
    notes.push(`Write-up was ${text.length} characters; only the first ${MAX_TEXT_CHARS} were reviewed.`);
    text = text.slice(0, MAX_TEXT_CHARS);
  }

  // ── Screenshots ──
  const imageFiles = files.filter((f) => f.type === 'image');
  if (imageFiles.length > MAX_IMAGES) {
    notes.push(`${imageFiles.length} screenshots submitted; only the first ${MAX_IMAGES} were reviewed.`);
  }

  const images = [];
  for (const file of imageFiles.slice(0, MAX_IMAGES)) {
    if (!IMAGE_MIME.has(file.mimeType)) {
      notes.push(`Skipped "${file.name}" (unsupported image format ${file.mimeType || 'unknown'}).`);
      continue;
    }
    const id = driveIdFrom(file.webViewLink);
    if (!id) { notes.push(`Skipped "${file.name}" (could not resolve its Drive id).`); continue; }

    try {
      const buf = await download(id, apiKey);
      if (buf.length > MAX_IMAGE_BYTES) {
        notes.push(`Skipped "${file.name}" (${Math.round(buf.length / 1024 / 1024)} MB, over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit).`);
        continue;
      }
      images.push({
        name: file.name,
        dataUrl: `data:${file.mimeType};base64,${buf.toString('base64')}`,
      });
    } catch (err) {
      notes.push(`Could not read "${file.name}": ${err.message}`);
    }
  }

  return { text, images, notes };
}
