import { CheckIcon, AlertIcon, InfoIcon } from './icons.jsx';
import './ui.css';

/**
 * A message about the state of the page or the last thing that happened.
 *
 * Every tone carries a glyph as well as a colour, so the severity survives
 * greyscale. Error and warning announce themselves via role="alert"; info and
 * success do not, because interrupting a screen reader to say "saved" is worse
 * than letting it be read in order.
 *
 * WHEN NOT TO USE IT
 * - Not for a field-level validation message — that belongs to the Field, next
 *   to the control that is wrong.
 * - Not for something transient. This is part of the page; a message that
 *   should disappear on its own is a Toast.
 * - Not as a decorative callout. If it is not about state, it is just a Card.
 */
const TONE = {
  info: InfoIcon,
  success: CheckIcon,
  warning: AlertIcon,
  error: AlertIcon,
};

export default function Alert({ children, tone = 'info', title }) {
  const Glyph = TONE[tone] || InfoIcon;
  const urgent = tone === 'error' || tone === 'warning';
  return (
    <div className="ui-alert" data-tone={tone} role={urgent ? 'alert' : 'status'}>
      <Glyph />
      <div>
        {title && <strong>{title}</strong>}
        {title && ' '}
        {children}
      </div>
    </div>
  );
}
