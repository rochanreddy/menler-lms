import './ui.css';

/**
 * A data table with its three non-happy states built in.
 *
 * `empty` is a required prop. A table that can render zero rows without saying
 * so is the single most common way a page looks broken: an empty <tbody> and a
 * loading <tbody> are visually identical, so a slow request reads as "no data"
 * and a real empty list reads as a bug. Passing no `empty` renders a visible
 * failure rather than an empty box, because a silent one is the bug.
 *
 * Columns marked `numeric` are right-aligned and set in tabular mono, so digits
 * line up down the column — a right-aligned proportional numeral still does
 * not compare cleanly against the one above it.
 *
 * Header is sticky, so scrolling a long roster never loses the column names.
 *
 * WHEN NOT TO USE IT
 * - For two or three fields about one thing, use a definition list or a Card.
 *   A table implies rows you compare against each other.
 * - For a list of links, use a list. A one-column table is a list with rules.
 * - Do not put a table inside a Card with padding; use padding="none" so the
 *   rules reach the card edge.
 */
export default function Table({
  columns = [],
  rows = [],
  rowKey = (_, i) => i,
  density = 'normal',
  caption,
  loading = false,
  error = null,
  empty,
  emptyColSpan,
}) {
  const span = emptyColSpan || columns.length || 1;

  const slot = (content) => (
    <tr>
      <td className="ui-table__slot" colSpan={span}>{content}</td>
    </tr>
  );

  let body;
  if (error) {
    // Error wins over everything: showing stale or empty rows next to a failed
    // request tells people the data is current when it is not.
    body = slot(error);
  } else if (loading) {
    body = slot(
      <div className="ui-skeleton-stack" role="status" aria-live="polite">
        <span className="ui-sr">Loading…</span>
        <div className="ui-skeleton" />
        <div className="ui-skeleton" />
        <div className="ui-skeleton" />
      </div>,
    );
  } else if (rows.length === 0) {
    body = slot(empty ?? 'This table was given no empty state. Add one.');
  } else {
    body = rows.map((row, i) => (
      <tr key={rowKey(row, i)}>
        {columns.map((c) => (
          <td key={c.key} data-numeric={c.numeric ? 'true' : undefined}>
            {c.cell ? c.cell(row) : row[c.key]}
          </td>
        ))}
      </tr>
    ));
  }

  return (
    <div className="ui-table-wrap">
      <table className="ui-table" data-density={density}>
        {caption && <caption className="ui-sr">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" data-numeric={c.numeric ? 'true' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}
