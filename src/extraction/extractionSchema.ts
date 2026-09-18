import { z } from 'zod';
import { ExtractionResult } from './types';

export const extractionFieldSchema = z.object({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'boolean', 'date', 'url']),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

export const extractionRequestSchema = z.object({
  source: z.enum(['page', 'selection', 'tabs']),
  fields: z.array(extractionFieldSchema).min(1),
  maxRows: z.number().int().positive().max(1000).optional(),
  outputFormat: z.enum(['table', 'json', 'csv']).optional(),
  urls: z.array(z.string().url()).optional(),
});

export const extractionResultSchema = z.object({
  fields: z.array(extractionFieldSchema),
  rows: z.array(z.record(z.string(), z.unknown())),
  sourceUrls: z.array(z.string()),
  warnings: z.array(z.string()),
  generatedAt: z.string(),
});

export function validateExtractionResult(value: unknown): ExtractionResult {
  return extractionResultSchema.parse(value) as ExtractionResult;
}
