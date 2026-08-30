import { useId } from 'react';
import { CheckIcon } from './icons.jsx';
import './ui.css';

/**
 * Checkbox, Radio and Switch — one implementation, three shapes.
 *
 * The real <input> stays in the DOM and is only visually replaced, so every
 * native keyboard binding still works: Space toggles, arrow keys move within a
 * radio group, and the control participates in form submission normally. The
 * whole row is a <label>, so the text is part of the hit target rather than
 * something you have to hit the box to activate.
 *
 * WHEN NOT TO USE THEM
 * - Switch is for a setting that takes effect immediately. If the change only
 *   applies after a Save, use Checkbox — a switch that needs saving lies about
 *   what it did.
 * - Radio is for one choice from a short, visible set. Past about five, use
 *   Select.
 * - For a checkbox that controls whether other fields are relevant, consider
 *   whether the fields should be absent rather than disabled.
 */
function Choice({ kind, label, checked, defaultChecked, onChange, disabled = false, name, value, id }) {
  const auto = useId();
  const controlId = id || `choice-${auto}`;

  return (
    <label className="ui-choice" data-kind={kind} data-disabled={disabled ? 'true' : undefined} htmlFor={controlId}>
      <input
        className="ui-choice__control"
        id={controlId}
        type={kind === 'radio' ? 'radio' : 'checkbox'}
        // A switch is a checkbox to the DOM but a switch to assistive tech.
        role={kind === 'switch' ? 'switch' : undefined}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        name={name}
        value={value}
      />
      <span className="ui-choice__box" aria-hidden="true">
        {kind === 'switch' ? <span className="ui-choice__thumb" /> : kind === 'checkbox' ? <CheckIcon /> : null}
      </span>
      <span className="ui-choice__label">{label}</span>
    </label>
  );
}

export const Checkbox = (props) => <Choice {...props} kind="checkbox" />;
export const Radio = (props) => <Choice {...props} kind="radio" />;
export const Switch = (props) => <Choice {...props} kind="switch" />;
