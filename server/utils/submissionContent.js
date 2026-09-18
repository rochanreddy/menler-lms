// Pulls the actual *content* of a submitted Drive folder into one EVIDENCE
// MANIFEST for utils/aiGrade.js to review.
//
// utils/driveVerify.js deliberately only reads metadata (does a doc exist? is
// it public?). This module goes one step further and downloads, so it is only
// ever called from the mentor-triggered review endpoint, never from the submit
// path.
//
// Files are downloaded with the same public-file + API-key approach as
// driveVerify: no OAuth, and it only works because the student already made
// the folder link-shareable.
//
// ── Why a manifest and not { text, images } ─────────────────────────────────
// The old shape had exactly two slots because the old rubric had exactly two
// stages, weighted 60/40. That fit about four of the twenty-seven pieces of
// work in the two curricula. Six Kickstarter assignments say "Submit: Claude
// Artifact" and nothing else, so they scored zero on a screenshot component
// they were never asked for; and an artifact had no extractor at all, so it
// arrived as raw markup or was rejected at the door as a dangerous file type.
//
// So: one numbered list of artefacts, each with a kind and its extracted
// content, and the rubric decides what each one is evidence OF. A screenshot
// is evidence for brief compliance and AI craft and artefact quality at once,
// which is how a mentor reads it.
//
// ── Video ───────────────────────────────────────────────────────────────────
// Video is listed and never downloaded. It is not graded: a mentor watches it
// and verifies it themselves. Listing it matters anyway, because a brief that
// asked for a Loom has had that deliverable met, and the rubric must not mark
// the student down for a file it refuses to look at.

import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// What the vision model accepts; anything else is listed as unreadable rather
// than sent and rejected.
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Guardrails so one oversized submission cannot blow up a request.
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;
// Per-artefact ceiling as well as the total: one 55k-character PDF must not
// crowd out the three-line reflection that answers half the brief.
const MAX_ITEM_CHARS = 24_000;

// Submission.files stores webViewLink but not the raw Drive id. Every Drive
// URL carries the id in a /d/<id>/ segment, for both drive.google.com file
// links and docs.google.com native-doc links.
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

const entities = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

const tidy = (s) => s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

function htmlToText(html) {
  return tidy(entities(
    html
      // Script and style bodies are not content, and an artifact is mostly
      // script. Dropping them is the difference between 2k of prose and 200k
      // of bundled React.
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|h[1-6]|li|div|tr|section|article|br)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ));
}

/**
 * What an HTML artifact IS, beyond the words in it.
 *
 * A Claude Artifact is judged partly as an object (rubric C5), and "has three
 * headings, a table and two embedded images" is most of what that judgement
 * needs. It is also the only honest way to describe an artifact that is mostly
 * interactive: the visible text of a working tool can be a dozen labels.
 */
function htmlShape(html) {
  const count = (re) => (html.match(re) || []).length;
  const bits = [];
  const headings = count(/<h[1-6]\b/gi);
  if (headings) bits.push(`${headings} heading${headings > 1 ? 's' : ''}`);
  const tables = count(/<table\b/gi);
  if (tables) bits.push(`${tables} table${tables > 1 ? 's' : ''}`);
  const lists = count(/<[uo]l\b/gi);
  if (lists) bits.push(`${lists} list${lists > 1 ? 's' : ''}`);
  const imgs = count(/<img\b/gi);
  if (imgs) bits.push(`${imgs} embedded image${imgs > 1 ? 's' : ''}`);
  const code = count(/<(pre|code)\b/gi);
  if (code) bits.push(`${code} code block${code > 1 ? 's' : ''}`);
  if (count(/<(script)\b/gi)) bits.push('interactive (has script)');
  return bits.join(', ');
}

// A Drive doc → plain text. Google-native Docs export directly as text; Word,
// PDF and HTML come down as bytes and go through a parser each. Anything else
// is read as UTF-8 and hoped for.
async function fileToText(file, apiKey) {
  const id = driveIdFrom(file.webViewLink);
  if (!id) throw new Error('could not resolve its Drive id');

  if (file.mimeType === 'application/vnd.google-apps.document') {
    return { text: (await download(id, apiKey, { exportMime: 'text/plain' })).toString('utf8').trim(), shape: '' };
  }

  const buf = await download(id, apiKey);
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (ext === 'docx' || file.mimeType.includes('wordprocessingml')) {
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    return { text: htmlToText(html), shape: '' };
  }

  if (ext === 'pdf' || file.mimeType === 'application/pdf') {
    const { text } = await new PDFParse({ data: new Uint8Array(buf) }).getText();
    return { text: (text || '').trim(), shape: '' };
  }

  if (ext === 'html' || ext === 'htm' || file.mimeType === 'text/html') {
    const raw = buf.toString('utf8');
    return { text: htmlToText(raw), shape: htmlShape(raw) };
  }

  return { text: buf.toString('utf8').trim(), shape: '' };
}

// driveVerify's classifier and the rubric's vocabulary are not the same words.
// 'html' becomes 'artifact' because that is what it is in this curriculum: six
// Kickstarter assignments say "Submit: Claude Artifact" and this is the file.
const KIND = {
  doc: 'document',
  html: 'artifact',
  image: 'screenshot',
  video: 'video',
  slides: 'other',
  other: 'other',
};

/**
 * Gather everything reviewable from a verified submission.
 *
 * @param {object} submission               with .files populated by driveVerify
 * @param {object} opts
 * @param {boolean} opts.creative           treat images as creative assets to be
 *                                          judged on craft, rather than as
 *                                          screenshots proving a thing ran.
 *                                          Set from the assignment's rubric
 *                                          class, since nothing about the file
 *                                          itself tells you which it is.
 *
 * Returns { items, notes, counts } where items is the numbered manifest, image
 * items still carry a `dataUrl` for the vision stage to describe, and notes
 * records everything that was skipped — so a review can say "3 screenshots
 * were too large" instead of silently grading fewer.
 */
export async function collectSubmissionContent(submission, { creative = false } = {}) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) throw new Error('Drive access is not configured on the server (missing GOOGLE_DRIVE_API_KEY).');

  const files = submission.files || [];
  const notes = [];
  const items = [];
  let n = 0;
  let textBudget = MAX_TEXT_CHARS;

  const push = (item) => { items.push({ n: ++n, ...item }); };

  // ── Anything the student typed into the box itself ──
  const typed = (submission.text || '').trim();
  if (typed) {
    push({ kind: 'document', name: 'Submission note', meta: `${typed.length} characters, typed into the LMS`, content: typed.slice(0, MAX_ITEM_CHARS) });
    textBudget -= Math.min(typed.length, MAX_ITEM_CHARS);
  }

  // ── Readable files: documents and artifacts ──
  for (const file of files.filter((f) => f.type === 'doc' || f.type === 'html')) {
    const kind = KIND[file.type];
    if (textBudget <= 0) {
      push({ kind, name: file.name, unreadable: 'the review had already reached its total reading limit before this file' });
      notes.push(`"${file.name}" was not read: the ${MAX_TEXT_CHARS}-character reading limit was reached first.`);
      continue;
    }
    try {
      const { text, shape } = await fileToText(file, apiKey);
      if (!text) {
        push({ kind, name: file.name, unreadable: 'no text could be extracted from it' });
        notes.push(`No text could be extracted from "${file.name}".`);
        continue;
      }
      const cap = Math.min(MAX_ITEM_CHARS, textBudget);
      const content = text.slice(0, cap);
      if (text.length > cap) notes.push(`"${file.name}" is ${text.length} characters; only the first ${cap} were reviewed.`);
      textBudget -= content.length;
      const meta = [`${text.length} characters`, shape].filter(Boolean).join(', ');
      push({ kind, name: file.name, meta, content });
    } catch (err) {
      push({ kind, name: file.name, unreadable: err.message });
      notes.push(`Could not read "${file.name}": ${err.message}`);
    }
  }

  // ── Images ──
  // Downloaded here, described by the vision stage in aiGrade.js. Kept as
  // dataUrl on the item rather than in a parallel array so the manifest number
  // a description cites is the same number the mentor sees.
  const imageFiles = files.filter((f) => f.type === 'image');
  if (imageFiles.length > MAX_IMAGES) {
    notes.push(`${imageFiles.length} images submitted; only the first ${MAX_IMAGES} were reviewed.`);
  }
  for (const file of imageFiles.slice(0, MAX_IMAGES)) {
    const kind = creative ? 'image' : 'screenshot';
    if (!IMAGE_MIME.has(file.mimeType)) {
      push({ kind, name: file.name, unreadable: `unsupported image format ${file.mimeType || 'unknown'}` });
      notes.push(`Skipped "${file.name}" (unsupported image format ${file.mimeType || 'unknown'}).`);
      continue;
    }
    const id = driveIdFrom(file.webViewLink);
    if (!id) {
      push({ kind, name: file.name, unreadable: 'could not resolve its Drive id' });
      notes.push(`Skipped "${file.name}" (could not resolve its Drive id).`);
      continue;
    }
    try {
      const buf = await download(id, apiKey);
      if (buf.length > MAX_IMAGE_BYTES) {
        push({ kind, name: file.name, unreadable: `${Math.round(buf.length / 1024 / 1024)} MB, over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit` });
        notes.push(`Skipped "${file.name}" (${Math.round(buf.length / 1024 / 1024)} MB, over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit).`);
        continue;
      }
      push({ kind, name: file.name, dataUrl: `data:${file.mimeType};base64,${buf.toString('base64')}` });
    } catch (err) {
      push({ kind, name: file.name, unreadable: err.message });
      notes.push(`Could not read "${file.name}": ${err.message}`);
    }
  }

  // ── Video: listed, never downloaded, never graded ──
  for (const file of files.filter((f) => f.type === 'video')) {
    push({ kind: 'video', name: file.name, meta: 'for the mentor to watch' });
  }

  // ── Everything else: listed so the model knows it was sent ──
  for (const file of files.filter((f) => !['doc', 'html', 'image', 'video'].includes(f.type))) {
    push({ kind: 'other', name: file.name, unreadable: `this review does not read ${file.type} files` });
  }

  const counts = items.reduce((acc, it) => ({ ...acc, [it.kind]: (acc[it.kind] || 0) + 1 }), {});
  return { items, notes, counts };
}
