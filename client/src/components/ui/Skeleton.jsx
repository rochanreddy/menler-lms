import './ui.css';

/**
 * A placeholder for content that is still arriving.
 *
 * Exists to make loading and empty visually unmistakable. "Loading…" and "No
 * sessions yet." are both a line of grey text, so a slow request reads as an
 * empty list; a shimmering block cannot be mistaken for either.
 *
 * The shimmer is inside a prefers-reduced-motion guard; with motion reduced it
 * stays a flat block, which still reads as a placeholder.
 *
 * WHEN NOT TO USE IT
 * - Not for a wait shorter than roughly a keystroke — flashing a skeleton is
 *   worse than showing nothing.
 * - Not for an action in flight. A button that was pressed shows its own
 *   loading state; do not replace the page around it.
 * - Not as a permanent placeholder for a feature that does not exist yet.
 */
export default function Skeleton({ rows = 3, label = 'Loading…' }) {
  return (
    <div className="ui-skeleton-stack" role="status" aria-live="polite">
      <span className="ui-sr">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ui-skeleton" />
      ))}
    </div>
  );
}
