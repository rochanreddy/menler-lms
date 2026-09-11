// How much of a class you have to actually sit through to be marked present.
//
// Joining used to be enough: Zoom's `participant_joined` marked you present and
// nothing ever looked again, so a student who opened the meeting and left after
// a minute counted the same as one who stayed for the whole class. This is the
// one definition of "enough", used by the webhook that accumulates time and by
// the sweep that finalises the register, so the two can never disagree.

import { sessionStart, sessionEnd } from './sessionTime.js';

/** A student must be in the meeting for at least this share of the class. */
export const MIN_SHARE = 0.45;

/**
 * The scheduled length of a class, or null when it cannot be known.
 *
 * Null matters: a session with no `endsAt` falls back to a four-hour default
 * elsewhere, and 45% of a made-up four hours is 1h48m — a bar a real two-hour
 * class could never clear. Rather than guess, callers treat null as "no basis
 * to judge" and leave the register alone.
 */
export function classLengthMs(session) {
  if (!session?.endsAt) return null;
  const len = sessionEnd(session) - sessionStart(session);
  return Number.isFinite(len) && len > 0 ? len : null;
}

/** Milliseconds a student must be present for, or null if unknowable. */
export function requiredMs(session) {
  const len = classLengthMs(session);
  return len === null ? null : Math.round(len * MIN_SHARE);
}

/**
 * Trim a Zoom presence interval to the part that overlaps the class itself.
 *
 * Someone who sits in the waiting room from half an hour early, or leaves the
 * meeting open for an hour after the class ends, has not attended more of it —
 * and without this they could clear the bar on the margins alone.
 */
export function overlapMs(session, fromMs, toMs) {
  const start = sessionStart(session);
  const end = sessionEnd(session);
  const from = Math.max(Number(fromMs) || 0, start);
  const to = Math.min(Number(toMs) || 0, end);
  return to > from ? to - from : 0;
}

/**
 * Does this record clear the bar?
 *
 * `null` means undecidable — the class has no end time, so there is no share to
 * take 45% of. Callers must leave such records exactly as they found them.
 */
export function meetsBar(session, attendedMs) {
  const need = requiredMs(session);
  if (need === null) return null;
  return (Number(attendedMs) || 0) >= need;
}
