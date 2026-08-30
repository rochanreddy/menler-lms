import './ui.css';

/**
 * The only button in the system.
 *
 * Five variants, four sizes, and every one of them implements the full state
 * matrix: default, hover, active, focus-visible, disabled and loading. Renders
 * an <a> when given `href`, with identical styling and focus behaviour, so a
 * "Join class" link and a "Save" button are never visually different things.
 *
 * WHEN NOT TO USE IT
 * - For navigation that should look like text in a sentence, use Text with a
 *   real <a>, not variant="link" — the link variant is still a control.
 * - For an icon-only affordance inside a dense row (a table row menu), check
 *   whether the row itself should be the target first.
 * - Do not reach for this to get a coloured box. It is a control; if nothing
 *   happens when it is pressed, it is not a button.
 *
 * There is no `className` or `style` prop, on purpose. If a page needs a look
 * this does not offer, that is a variant to add here, not an override to pass.
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  disabled = false,
  href,
  target,
  rel,
  onClick,
  leadingIcon,
  trailingIcon,
  title,
  form,
  name,
  value,
  ariaLabel,
  ariaControls,
  ariaExpanded,
}) {
  // Loading is a form of disabled for interaction purposes, but it must stay
  // focusable and announced, so it is never the native `disabled` attribute.
  const inert = disabled || loading;

  const handleClick = (e) => {
    if (inert) { e.preventDefault(); return; }
    if (onClick) onClick(e);
  };

  const inner = (
    <>
      {leadingIcon && <span className="ui-btn__icon" data-side="leading">{leadingIcon}</span>}
      {children != null && <span className="ui-btn__label">{children}</span>}
      {trailingIcon && <span className="ui-btn__icon" data-side="trailing">{trailingIcon}</span>}
      {loading && (
        <span className="ui-btn__spinner">
          <span className="ui-spinner" />
          <span className="ui-sr">Working…</span>
        </span>
      )}
    </>
  );

  const shared = {
    className: 'ui-btn',
    'data-variant': variant,
    'data-size': size,
    'data-loading': loading ? 'true' : undefined,
    'aria-busy': loading || undefined,
    'aria-label': ariaLabel,
    'aria-controls': ariaControls,
    'aria-expanded': ariaExpanded,
    title,
    onClick: handleClick,
  };

  if (href) {
    return (
      // A disabled link is not a link: dropping href takes it out of the
      // navigation semantics while aria-disabled keeps it announced.
      <a {...shared} href={inert ? undefined : href} target={target} rel={rel} aria-disabled={inert || undefined}>
        {inner}
      </a>
    );
  }

  return (
    <button
      {...shared}
      // While loading, a submit button must not submit — swapping the type is
      // what makes that true, rather than relying on the click guard alone.
      type={loading && type === 'submit' ? 'button' : type}
      disabled={disabled}
      aria-disabled={loading || undefined}
      form={form}
      name={name}
      value={value}
    >
      {inner}
    </button>
  );
}
