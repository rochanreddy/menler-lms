import { useId } from 'react';
import { AlertIcon } from './icons.jsx';
import './ui.css';

/**
 * The label / help / error scaffold every form control is built on.
 *
 * Wiring accessible form errors is the thing hand-rolled forms reliably get
 * wrong, so it happens here once instead of at ~40 call sites. Field
 * guarantees four things no caller has to remember:
 *   1. the label is associated by htmlFor/id (an id is generated if not given),
 *   2. an errored control gets aria-invalid,
 *   3. aria-describedby points at the help text, the error, or both,
 *   4. the error carries an icon, so the state is never signalled by colour
 *      alone.
 *
 * Children is a function so the control receives the ids it must bind:
 *   <Field label="Email">{(f) => <input {...f} />}</Field>
 *
 * WHEN NOT TO USE IT
 * - Not for checkboxes, radios or switches — their label sits beside the
 *   control, not above it. Use Checkbox / Radio / Switch, which handle it.
 * - Not as a generic layout wrapper. If there is no labelled control inside,
 *   this is the wrong component.
 */
export default function Field({ label, help, error, required = false, id, children }) {
  const auto = useId();
  const fieldId = id || `field-${auto}`;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;

  // Describe by whichever of the two actually rendered. Pointing at an absent
  // node is worse than pointing at nothing — the announcement just goes quiet.
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="ui-field">
      {label && (
        <label className="ui-field__label" htmlFor={fieldId}>
          {label}
          {required && <span className="ui-field__required" aria-hidden="true">*</span>}
          {required && <span className="ui-sr">(required)</span>}
        </label>
      )}

      {children({
        id: fieldId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required,
      })}

      {help && <p className="ui-field__help" id={helpId}>{help}</p>}
      {error && (
        <p className="ui-field__error" id={errorId} role="alert">
          <AlertIcon />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
