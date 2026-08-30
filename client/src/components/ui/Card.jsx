import './ui.css';

/**
 * A bounded surface on the page background.
 *
 * One elevation by default. A card inside a card is almost always a sign the
 * inner thing wants to be a list row or a section, not another surface.
 *
 * WHEN NOT TO USE IT
 * - Not to group things that are already visually grouped. A card around a
 *   single stat adds a border and no meaning.
 * - Not as a click target on its own — if the whole card is interactive, it
 *   needs a real control inside it that carries the label and the focus.
 * - padding="none" is for cards whose child manages its own edges (a table, a
 *   media frame), not a way to get a tighter card.
 */
export default function Card({ children, padding = 'normal', elevation = 'sm', as = 'div' }) {
  const Element = as;
  return (
    <Element className="ui-card" data-padding={padding} data-elevation={elevation}>
      {children}
    </Element>
  );
}

/** Title row for a Card: heading on the left, at most one action on the right. */
export function CardHeader({ children, action }) {
  return (
    <div className="ui-card__header">
      <div>{children}</div>
      {action}
    </div>
  );
}
