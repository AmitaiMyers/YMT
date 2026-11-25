// CSV writing for exports: RFC 4180 quoting, CRLF line ends.

/** One CSV cell: quoted when it holds a comma, quote or line break. */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {string[]} header
 * @param {Array<Array<unknown>>} rows
 */
export function toCsv(header, rows) {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
