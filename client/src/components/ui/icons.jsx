/**
 * Internal icon set for the primitives.
 *
 * Deliberately local to ui/: a primitive may not reach up into components/ for
 * LineIcon, or the dependency direction inverts. These are the only glyphs the
 * primitives themselves need — status, alert tone, and control affordances.
 *
 * NOT for page use. Pages import LineIcon or Icon; this set exists so a
 * primitive can render its own non-colour signal without a dependency.
 */
const base = {
  width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
  strokeLinejoin: 'round', 'aria-hidden': 'true',
};

export const CheckIcon = () => <svg {...base}><path d="m5 12.5 4.5 4.5L19 7" /></svg>;
export const ClockIcon = () => <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const UploadIcon = () => <svg {...base}><path d="M12 16V5" /><path d="m7.5 9.5 4.5-4.5 4.5 4.5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>;
export const AlertIcon = () => <svg {...base}><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
export const InfoIcon = () => <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>;
export const ChevronDownIcon = () => <svg {...base}><path d="m6 9 6 6 6-6" /></svg>;
export const CloseIcon = () => <svg {...base}><path d="M6 6 18 18" /><path d="M18 6 6 18" /></svg>;
export const DashIcon = () => <svg {...base}><path d="M6 12h12" /></svg>;
