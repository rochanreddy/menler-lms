import Field from './Field.jsx';
import { ChevronDownIcon } from './icons.jsx';
import './ui.css';

/**
 * A native <select>, with its label, help text and error wired up.
 *
 * Native on purpose: it is keyboard- and screen-reader-correct for free, and
 * on mobile it gets the platform picker. The only custom part is the chevron,
 * because the native arrow cannot be styled.
 *
 * Options are passed as data, not children, so a page cannot smuggle markup
 * into the list:
 *   <Select label="Batch" options={[{ value: '1', label: 'Batch 1' }]} />
 *
 * WHEN NOT TO USE IT
 * - For more than about fifteen options, or anything needing search, this is
 *   the wrong control — that is a combobox, which the system does not have
 *   yet. Ask before building one.
 * - For two mutually exclusive options, Radio or Switch reads faster.
 */
export default function Select({
  label,
  help,
  error,
  required = false,
  id,
  value,
  defaultValue,
  onChange,
  onBlur,
  options = [],
  placeholder,
  disabled = false,
  name,
  ariaLabel,
}) {
  return (
    <Field label={label} help={help} error={error} required={required} id={id}>
      {(field) => (
        <span className="ui-select-wrap">
          <select
            {...field}
            className="ui-select"
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            onBlur={onBlur}
            disabled={disabled}
            name={name}
            aria-label={label ? undefined : ariaLabel}
          >
            {/* An empty first option is how a native select expresses "nothing
                chosen yet"; without it the first real option looks selected. */}
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon />
        </span>
      )}
    </Field>
  );
}
