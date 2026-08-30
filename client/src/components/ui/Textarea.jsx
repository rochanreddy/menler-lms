import Field from './Field.jsx';
import './ui.css';

/**
 * Multi-line text, with its label, help text and error wired up.
 *
 * Resizes vertically only — horizontal resize breaks the column it sits in.
 *
 * WHEN NOT TO USE IT
 * - For a single value that happens to be long (a URL, a title), use Input.
 *   The taller box tells people to write more than you want.
 * - For rich content, this is not a rich-text editor and should not become
 *   one by accident.
 */
export default function Textarea({
  label,
  help,
  error,
  required = false,
  id,
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder,
  disabled = false,
  readOnly = false,
  name,
  rows = 4,
  maxLength,
  ariaLabel,
}) {
  return (
    <Field label={label} help={help} error={error} required={required} id={id}>
      {(field) => (
        <textarea
          {...field}
          className="ui-textarea"
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          name={name}
          rows={rows}
          maxLength={maxLength}
          aria-label={label ? undefined : ariaLabel}
        />
      )}
    </Field>
  );
}
