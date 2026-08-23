// Empty and loading states.
//
// The app had 31 empty states and every one was a bare grey sentence — "No
// submissions yet." — visually identical to a caption, a hint, or a disabled
// label. Nothing distinguished "this list is empty" from "this text happens to
// be grey", so a mentor opening a batch with no sessions read it as a rendering
// glitch rather than an answer.
//
// An empty state has to do three things, and a grey <p> does one of them:
//   1. say the container is empty (not broken, not still loading),
//   2. say what will put something in it,
//   3. offer the action, when the person looking at it is the one who can.
//
// Loading gets the same treatment for the opposite reason: "Loading…" and
// "No sessions yet." look the same, so a slow request read as an empty list.
// Skeletons keep the two unmistakably different.

import Icon from './Icon.jsx';

/**
 * @param icon    a key from Icon.jsx (home/learning/library/forum/programs/
 *                batches/students/mentors/webinar/grades) — omit for the dot.
 * @param title   what is empty, as a statement.
 * @param hint    what will fill it. Skip it only when it is genuinely obvious.
 * @param action  {label, onClick} for the person who can act; omit otherwise —
 *                offering an action to someone without the permission to take
 *                it is worse than offering none.
 * @param inline  compact variant for a slot inside a card, rather than a page.
 */
export default function Empty({ icon, title, hint, action, inline = false }) {
  return (
    <div className={`empty ${inline ? 'is-inline' : ''}`}>
      <span className="empty-mark" aria-hidden="true">
        {icon ? <Icon name={icon} /> : <span className="empty-dot" />}
      </span>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action && (
        <button type="button" className="btn sm ghost empty-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Skeleton rows standing in for a list that is still loading. `rows` should
 * roughly match what is coming, so the layout doesn't lurch when it lands.
 */
export function Loading({ rows = 3, inline = false }) {
  return (
    <div className={`loading-rows ${inline ? 'is-inline' : ''}`} role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton loading-row" style={{ width: `${100 - i * 9}%` }} />
      ))}
    </div>
  );
}
