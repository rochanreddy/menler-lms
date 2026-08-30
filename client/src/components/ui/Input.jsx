import Field from './Field.jsx';
import './ui.css';

/**
 * A single-line text input, with its label, help text and error wired up.
 *
 * WHEN NOT TO USE IT
 * - For more than a sentence of input, use Textarea.
 * - For a fixed set of options, use Select — a free-text field that is
 *   validated against a list is a Select wearing a disguise.
 * - For search that filters as you type, this is fine; for search that
 *   navigates, the command palette already exists.
 *
 * `trailingAction` is for a control that belongs to the value itself — a
 * password reveal, a copy button. Not for a submit, and not for anything that
 * navigates away.
 */
export default function Input({
  label,
  help,
  error,
  required = false,
  id,
  type = 'text',
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder,
  disabled = false,
  readOnly = false,
  name,
  autoComplete,
  autoFocus,
  inputMode,
  min,
  max,
  step,
  minLength,
  maxLength,
  pattern,
  ariaLabel,
  trailingAction,
}) {
  const control = (field) => (
        <input
          {...field}
          className="ui-input"
          type={type}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          name={name}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          inputMode={inputMode}
          min={min}
          max={max}
          step={step}
          minLength={minLength}
          maxLength={maxLength}
          pattern={pattern}
          aria-label={label ? undefined : ariaLabel}
        />
  );

  return (
    <Field label={label} help={help} error={error} required={required} id={id}>
      {(field) => (trailingAction
        ? <span className="ui-input-wrap">{control(field)}{trailingAction}</span>
        : control(field))}
    </Field>
  );
}
