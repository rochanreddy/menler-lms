import './ui.css';

/**
 * Every piece of text in the product, by role.
 *
 * This is the component that ends the "small text formatting" drift. The app
 * had 34 distinct font-sizes doing the work of about eight roles; a page can
 * now only ask for a role, not a size. Each role owns its family, size,
 * leading and weight as one decision.
 *
 * ROLES
 *   display       page-opening moment. One per screen, at most.
 *   heading-1..3  section structure. Do not skip levels for visual reasons.
 *   body          default running text.
 *   body-reading  lesson prose only — serif, capped at --measure-prose.
 *   label         a name for an adjacent control or value.
 *   caption       secondary metadata. Muted by default.
 *   data          scores, roll numbers, IDs — mono and tabular, so digits
 *                 line up in a column.
 *
 * WHEN NOT TO USE IT
 * - Not for text already inside a primitive that styles its own content
 *   (Button labels, Badge, table headers). Wrapping those double-styles them.
 * - body-reading is for lesson content, not for making a paragraph "nicer".
 * - data is for values, not for code samples.
 */
const DEFAULT_ELEMENT = {
  display: 'div',
  'heading-1': 'h1',
  'heading-2': 'h2',
  'heading-3': 'h3',
  body: 'p',
  'body-reading': 'p',
  label: 'span',
  caption: 'p',
  data: 'span',
};

export default function Text({ children, role = 'body', as, tone, align, id, htmlFor }) {
  const Element = as || DEFAULT_ELEMENT[role] || 'p';
  return (
    <Element className="ui-text" data-role={role} data-tone={tone} data-align={align} id={id} htmlFor={htmlFor}>
      {children}
    </Element>
  );
}
