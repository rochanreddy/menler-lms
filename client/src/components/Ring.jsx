// A percentage as a ring. Used by the Classroom rail (course progress) and the
// quiz cards (score). r=17 on a 40-unit box; the size prop scales the whole thing.
export default function Ring({ pct, size = 44, label, tone }) {
  const C = 2 * Math.PI * 17;
  // tone overrides the automatic colouring (a course at 30% isn't "low", a
  // quiz score of 30% is).
  const cls = tone != null ? tone : (pct >= 100 ? 'ring-full' : pct < 50 ? 'ring-low' : '');
  return (
    <span className={`ring ${cls}`} style={{ width: size, height: size }} role="img" aria-label={label || `${pct}%`}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <circle cx="20" cy="20" r="17" className="ring-track" />
        <circle cx="20" cy="20" r="17" className="ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(100, pct)) / 100)} />
      </svg>
      <span className="ring-num">{pct}<small>%</small></span>
    </span>
  );
}
