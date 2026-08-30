import './ui.css';

/**
 * A person, at a glance.
 *
 * Falls back to initials when there is no image, which is the common case in
 * this product. The image is decorative — the person's name is always adjacent
 * in the layouts that use this — so it carries an empty alt rather than
 * repeating the name to a screen reader twice.
 *
 * WHEN NOT TO USE IT
 * - Not as the only identification of a person. Initials are ambiguous; the
 *   name goes next to it.
 * - Not for a program, batch or file. This is for people.
 */
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, src, size = 'md' }) {
  return (
    <span className="ui-avatar" data-size={size}>
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{initials(name)}</span>}
    </span>
  );
}
