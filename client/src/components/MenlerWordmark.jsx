// MENLER wordmark logo — matches the menler.in marketing site (spec 02-A).
// Lowercase "menler" in DM Sans 900, Specialist rule under "menle", Placed dot.
// theme: 'light' (ink on light bg) | 'dark' (parchment on dark bg).
export default function MenlerWordmark({ size = 24, theme = 'light', rule = '#534AB7', dot = '#1D9E75', tagline = false }) {
  const word = theme === 'dark' ? '#F1EFE8' : '#26215C';
  return (
    <span className="menler-wm" style={{ fontSize: size, color: word, '--menler-rule': rule }}>
      <span className="menler-wm__word">
        <span className="menler-wm__ruled">menle</span>r
        <span className="menler-wm__dot" style={{ background: dot }} />
      </span>
      {tagline && <span className="menler-wm__tagline" style={{ color: theme === 'dark' ? '#AFA9EC' : '#534AB7' }}>Your turning point in the AI era.</span>}
    </span>
  );
}
