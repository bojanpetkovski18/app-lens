import type { MockRecord } from './generator';

function cell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Spreadsheets run cells that start with these characters as formulas.
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function recordsToCsv(records: readonly MockRecord[]): string {
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const rows = records.map((record) => columns.map((column) => cell(record[column])).join(','));
  return `${[columns.map(cell).join(','), ...rows].join('\r\n')}\r\n`;
}
