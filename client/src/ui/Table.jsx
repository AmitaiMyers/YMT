// Accessible data table: caption (visually hidden), scoped headers, bidi-isolated text cells.
// The scroll box is `relative` so visually hidden labels stay inside it (otherwise they widen the whole page on
// phones), and it is a focusable, labelled region so keyboard users can scroll wide tables (WCAG 2.1.1).

import { EmptyState } from './Feedback.jsx';

export function Table({ caption, columns, rows, rowKey = 'id', empty }) {
  if (rows.length === 0) return typeof empty === 'string' ? <EmptyState title={empty} /> : empty;
  return (
    <div className="relative -mx-4 overflow-x-auto sm:-mx-6" role="region" aria-label={caption} tabIndex={0}>
      <table className="min-w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th key={column.key} scope="col" className="whitespace-nowrap px-4 py-2 text-start text-[13px] font-semibold text-subtle sm:px-6">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]} className="border-b border-line last:border-0 transition-colors transition-ui hover:bg-hover">
              {columns.map((column) => {
                const content = column.render ? column.render(row) : row[column.key];
                return (
                  <td key={column.key} className={`px-4 py-3 align-top sm:px-6 ${column.numeric ? 'tabular' : ''}`}>
                    {typeof content === 'string' ? <bdi>{content}</bdi> : (content ?? '—')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
