// Minimal RFC 4180 CSV reader for list imports: quoted fields, doubled quotes, CRLF, a leading BOM.

/** The delimiter used most in the header line: comma, semicolon (European Excel) or tab. */
export function detectDelimiter(text) {
  const header = text.split(/\r?\n/, 1)[0];
  const counts = [',', ';', '\t'].map((delimiter) => [delimiter, header.split(delimiter).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** Parse CSV text into rows of string cells. Fully empty lines are dropped. */
export function parseCsv(text, delimiter) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((value) => value.trim())).filter((r) => r.some((value) => value !== ''));
}

/** One CSV cell: quoted when it holds a comma, quote or line break (RFC 4180). */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows as CSV text (RFC 4180, CRLF line ends).
 * @param {string[]} header
 * @param {Array<Array<unknown>>} rows
 */
export function toCsv(header, rows) {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
