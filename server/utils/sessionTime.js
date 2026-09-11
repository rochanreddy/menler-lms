// When a class counts as "on". One definition, used by every place that has
// to decide whether a join belongs to a session — the LMS Join button, the Zoom
// webhook, and the sweep that marks the no-shows absent — so the three can
// never disagree about whether someone was in class.

// A session with no end time is assumed to run this long. Four hours is what
// the Join button already assumed before end times existed, kept so that
// sessions scheduled before then behave exactly as they did.
export const DEFAULT_LENGTH_MS = 4 * 60 * 60 * 1000;
export const EARLY_MS = 15 * 60 * 1000; // doors open 15 min before the start
export const LATE_MS = 60 * 60 * 1000; // …and stay open an hour past the end

export const sessionStart = (s) => new Date(s.startsAt).getTime();
export const sessionEnd = (s) => (s.endsAt ? new Date(s.endsAt).getTime() : sessionStart(s) + DEFAULT_LENGTH_MS);

export const joinWindow = (s) => ({ opens: sessionStart(s) - EARLY_MS, closes: sessionEnd(s) + LATE_MS });

export function isWithinWindow(s, at = Date.now()) {
  const w = joinWindow(s);
  return at >= w.opens && at <= w.closes;
}

// Zoom shows meeting ids as "845 123 4567"; its webhook sends 8451234567.
// Stored digits-only, or a pasted id with spaces would never match an event.
export const normMeetingId = (s) => String(s || '').replace(/\D/g, '');
