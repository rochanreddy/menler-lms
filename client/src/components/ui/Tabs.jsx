import './ui.css';

/**
 * A single row of sibling views.
 *
 * Implements the ARIA tabs keyboard contract: arrows move between tabs, Home
 * and End jump to the ends, and only the selected tab is in the tab order, so
 * Tab moves past the set rather than through it. The active tab is marked by
 * the rule motif rather than a filled pill, matching the rest of the app.
 *
 * Controlled only — the selected value lives with the caller, because in this
 * app it is usually also in the URL.
 *
 * WHEN NOT TO USE IT
 * - For navigation between routes, use links. Tabs imply the content swaps in
 *   place and the page does not change.
 * - Past about five tabs, or when labels wrap, the content wants a different
 *   structure.
 * - Never for a sequence. Tabs are siblings, not steps.
 */
export default function Tabs({ tabs = [], value, onChange, label = 'Sections' }) {
  const move = (delta, i) => {
    const next = (i + delta + tabs.length) % tabs.length;
    onChange(tabs[next].value);
  };

  const onKeyDown = (e, i) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1, i); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1, i); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(tabs[0].value); }
    else if (e.key === 'End') { e.preventDefault(); onChange(tabs[tabs.length - 1].value); }
  };

  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            className="ui-tab"
            type="button"
            role="tab"
            id={`tab-${t.value}`}
            aria-selected={selected}
            aria-controls={`panel-${t.value}`}
            // Roving tabindex: the set is one tab stop, not one per tab.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** The panel a tab controls. Renders nothing unless its tab is selected. */
export function TabPanel({ value, selected, children }) {
  if (value !== selected) return null;
  return (
    <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`} tabIndex={0}>
      {children}
    </div>
  );
}
