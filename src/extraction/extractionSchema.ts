import { z } from 'zod';
import { ExtractionResult } from './types';

export const extractionFieldSchema = z.object({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'boolean', 'date', 'url']),
  description: z.string().optional(),
  required: z.boolean().optional(),
});
export const extractionPlanSchema = z.object({
  version: z.literal(1),
  sourceKind: z.enum(['table', 'list', 'repeated-block', 'embedded-json']),
  listSelector: z.string().min(1),
  itemSelector: z.string().min(1).optional(),
  fields: z.array(z.object({ name: z.string().min(1), selector: z.string().optional(), column: z.number().int().nonnegative().optional(), required: z.boolean().optional() })).min(1),
  detailLinkSelector: z.string().optional(),
  nextSelector: z.string().optional(),
  maxPages: z.number().int().min(1).max(20),
  maxRows: z.number().int().min(1).max(100),
});

export const extractionRequestSchema = z.object({
  source: z.enum(['page', 'selection', 'tabs']),
  fields: z.array(extractionFieldSchema).min(1),
  maxRows: z.coerce.number().int().positive().max(100).default(100),
  outputFormat: z.enum(['table', 'json', 'csv']).optional(),
  urls: z.array(z.string().url()).optional(),
  selectionText: z.string().optional(),
  plan: extractionPlanSchema.optional(),
});

export const extractionResultSchema = z.object({
  fields: z.array(extractionFieldSchema),
  rows: z.array(z.record(z.string(), z.unknown())),
  sourceUrls: z.array(z.string()),
  warnings: z.array(z.string()),
  generatedAt: z.string(),
  partial: z.boolean().optional(),
  completeness: z.number().min(0).max(1).optional(),
  plan: extractionPlanSchema.optional(),
});

export function validateExtractionResult(value: unknown): ExtractionResult {
  const parsed = extractionResultSchema.parse(value) as ExtractionResult;
  const fields = parsed.fields;
  const warnings = [...parsed.warnings];
  const rows = parsed.rows.map((row, rowIndex) => Object.fromEntries(fields.map(field => {
    const value = normalizeFieldValue(row[field.key], field.type);
    if (field.required && value === null) warnings.push(`Row ${rowIndex + 1} is missing ${field.label}`);
    return [field.key, value];
  })));
  const required = fields.filter(field => field.required);
  const total = rows.length * required.length;
  const complete = total ? rows.reduce((count, row) => count + required.filter(field => row[field.key] !== null).length, 0) / total : rows.length ? 1 : 0;
  if (!rows.length) warnings.push('No matching records were found');
  return { ...parsed, rows, warnings: [...new Set(warnings)], completeness: complete, partial: rows.length > 0 && complete < 1 };
}

function normalizeFieldValue(value: unknown, type: string): string | number | boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (type === 'number') { const number = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, '')); return Number.isFinite(number) ? number : null; }
  if (type === 'boolean') { if (typeof value === 'boolean') return value; if (/^(true|yes|1|in stock)$/i.test(String(value))) return true; if (/^(false|no|0|out of stock)$/i.test(String(value))) return false; return null; }
  if (type === 'url') { try { const url = new URL(String(value)); return /^https?:$/.test(url.protocol) ? url.toString() : null; } catch { return null; } }
  if (type === 'date') return Number.isNaN(Date.parse(String(value))) ? null : String(value);
  return String(value);
}
