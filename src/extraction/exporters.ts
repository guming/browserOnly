import { ExtractionResult } from './types';

export function toJson(result: ExtractionResult): string {
  return JSON.stringify(result.rows, null, 2);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(result: ExtractionResult): string {
  const keys = result.fields.map((field) => field.key);
  const header = keys.map(csvCell).join(',');
  const lines = result.rows.map((row) => keys.map((key) => csvCell(row[key])).join(','));
  return [header, ...lines].join('\r\n');
}
