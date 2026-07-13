// Flat 2D black-and-white line icons (no emoji). Inherit color via currentColor.
const ICONS = {
  megaphone: <><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  video: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3z" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5L16 9" /></>,
  rocket: <><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.8-.8.9-2.1.2-3a2.1 2.1 0 0 0-3.2 0z" /><path d="M9 12c1.5-4 4-7 9-8 0 5-3 7.5-8 9" /><path d="M15 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m11 12 8-8" /><path d="m16 7 2.5 2.5" /><path d="m13.5 9.5 2.5 2.5" /></>,
};

export default function LineIcon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      {ICONS[name] || null}
    </svg>
  );
}
