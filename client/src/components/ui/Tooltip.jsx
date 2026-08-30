import { useId, useState } from 'react';
import './ui.css';

/**
 * A short label revealed on hover or keyboard focus.
 *
 * Shows on focus as well as hover, and is wired with aria-describedby, so the
 * text is not invisible to anyone navigating by keyboard or screen reader —
 * which is the usual failure of a hover-only tooltip.
 *
 * WHEN NOT TO USE IT
 * - Never for information required to complete a task. Anything you must read
 *   to proceed cannot live behind a hover; put it in help text.
 * - Never on touch-only affordances — there is no hover to discover it with.
 * - Not as a replacement for a visible label on an icon button. Give the
 *   button an ariaLabel; the tooltip is a convenience on top, not the label.
 */
export default function Tooltip({ label, children }) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <span
      className="ui-tooltip-wrap"
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      <span aria-describedby={shown ? id : undefined}>{children}</span>
      {shown && <span className="ui-tooltip" role="tooltip" id={id}>{label}</span>}
    </span>
  );
}
