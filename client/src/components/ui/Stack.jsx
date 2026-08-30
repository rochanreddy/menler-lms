import './ui.css';

/**
 * Vertical rhythm between siblings.
 *
 * Added because migrating the first page proved the set could not express a
 * form without it: every gap would have had to be an inline margin, which is
 * the exact drift the system exists to stop. Gap comes from the spacing scale,
 * so a page can pick a step but never a number.
 *
 * WHEN NOT TO USE IT
 * - Not for a horizontal row — that is a different concern and this only ever
 *   stacks.
 * - Not to add space around one element. If a single thing needs breathing
 *   room, the component above or below it owns that space.
 * - Not as a general div replacement. If there is nothing to space, it is a
 *   div.
 */
export default function Stack({ children, gap = '4', as = 'div' }) {
  const Element = as;
  return <Element className="ui-stack" data-gap={gap}>{children}</Element>;
}
