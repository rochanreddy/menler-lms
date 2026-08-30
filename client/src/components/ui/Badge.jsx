import { CheckIcon, ClockIcon, UploadIcon, AlertIcon } from './icons.jsx';
import './ui.css';

/**
 * Badge labels a PERSON or a category. StatusPill labels a piece of WORK.
 *
 * They are separate components because conflating them is how a roster ends up
 * with a row of pills that all look alike. A badge says what something is; a
 * status pill says where in its lifecycle it is.
 *
 * WHEN NOT TO USE THEM
 * - Badge is not a button. If it filters or navigates, it is a control.
 * - Do not use a badge to shout. A row with five badges communicates nothing.
 */
export function Badge({ children, role }) {
  return <span className="ui-badge" data-role={role}>{children}</span>;
}

/**
 * The five states one piece of student work moves through.
 *
 * Never colour-only: each state carries its own label and its own glyph, so
 * the pill is still readable in greyscale and to anyone who cannot separate
 * the hues. not-started is the one state with no natural icon, so it takes the
 * dot motif as a hollow ring — a shape difference rather than a borrowed
 * glyph that would imply the wrong thing.
 *
 * WHEN NOT TO USE IT
 * - Not for a person's role — that is Badge.
 * - Not for a yes/no fact ("has a mentor"). This scale is a lifecycle; using
 *   it for a boolean implies progress that does not exist.
 */
const STATUS = {
  'not-started': { label: 'Not started', Glyph: null },
  'in-progress': { label: 'In progress', Glyph: ClockIcon },
  submitted: { label: 'Submitted', Glyph: UploadIcon },
  graded: { label: 'Graded', Glyph: CheckIcon },
  overdue: { label: 'Overdue', Glyph: AlertIcon },
};

export function StatusPill({ status, label }) {
  const spec = STATUS[status];
  if (!spec) return null;
  const { Glyph } = spec;
  return (
    <span className="ui-status" data-status={status}>
      {Glyph ? <Glyph /> : <span className="ui-status__dot" />}
      {label || spec.label}
    </span>
  );
}

export const STATUS_KEYS = Object.keys(STATUS);
