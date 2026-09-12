// When a class counts as "on". One definition, used by every place that has
// to decide whether a join belongs to a session — the LMS Join button, the Zoom
// webhook, and the sweep that marks the no-shows absent — so the three can
// never disagree about whether someone was in class.

// A session with no end time is assumed to run this long. Four hours is what
// the Join button already assumed before end times existed, kept so that
// sessions scheduled before then behave exactly as they did.
export const DEFAULT_LENGTH_MS = 4 * 60 * 60 * 1000;
// Doors open 5 minutes before the start and shut 5 minutes after the end.
//
// This is deliberately tight. It used to be 15 minutes before and a full hour
// after, and the Home card treated "starts today" as live — so a 7 pm class
// put a green Join button on the page from midnight, and the room stayed
// joinable until 11. A button that is live all day teaches students it means
// nothing in particular; one that appears five minutes before the class is a
// signal that the class is starting NOW.
//
// It is also the attendance window, so the same five minutes decide whether a
// Zoom join belongs to this class. That is the intended trade: someone who
// turns up more than five minutes after a class has ENDED did not attend it.
export const EARLY_MS = 5 * 60 * 1000;
export const LATE_MS = 5 * 60 * 1000;

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
