// Read an uploaded list into rows of text cells: Excel (.xlsx) or CSV (with a chosen text encoding).
// Used by the watch-list import (company lists, Apollo or Lusha exports) and the SHEPHA exclusion list.

import { readSheet } from 'read-excel-file/browser';
import { detectDelimiter, parseCsv } from '../../../shared/csv.js';

export const SPREADSHEET_ACCEPT = '.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function isExcel(file) {
  return /\.xlsx$/i.test(file.name);
}

/** One cell as trimmed text (numbers and dates from Excel become their text form; empty cells become ''). */
export function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** @returns {Promise<string[][]>} the first sheet (Excel) or the whole file (CSV), header row first */
export async function readRows(file, encoding = 'utf-8') {
  if (isExcel(file)) {
    const sheet = await readSheet(file);
    return sheet.map((row) => row.map(cellText));
  }
  if (!/\.csv$/i.test(file.name)) throw new Error('Choose an Excel (.xlsx) or CSV file');
  const text = new TextDecoder(encoding).decode(await file.arrayBuffer());
  return parseCsv(text, detectDelimiter(text));
}
