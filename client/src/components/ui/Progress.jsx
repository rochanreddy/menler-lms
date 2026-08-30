import './ui.css';

/**
 * How far through something a person is.
 *
 * Announced as a real progressbar with its min, max and current value, and the
 * number is rendered as text beside the bar — a bar on its own is unreadable
 * to anyone who cannot see it, and imprecise for everyone else.
 *
 * WHEN NOT TO USE IT
 * - Not for an indeterminate wait. If you cannot say how far along it is, use
 *   Skeleton or a Button in its loading state.
 * - Not as a rating or a score out of ten. This means "distance travelled",
 *   and reusing it for quality reads as "40% finished".
 */
export default function Progress({ value, max = 100, label, showValue = true }) {
  // Clamp rather than trust: a percentage computed from a stale total can go
  // past 100 and would otherwise overflow the track.
  const safe = Math.max(0, Math.min(max, value ?? 0));
  const pct = max === 0 ? 0 : Math.round((safe / max) * 100);

  return (
    <div className="ui-progress">
      <div
        className="ui-progress__track"
        role="progressbar"
        aria-valuenow={safe}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div className="ui-progress__fill" style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className="ui-progress__value">{pct}%</span>}
    </div>
  );
}
