import { z } from 'zod';

export const officeConfigSchema = z.object({
  mode: z.enum(['inspection', 'archive']),
  name: z.string().trim().min(1).max(100),
  tableSelector: z.string().trim().min(1).max(1000),
  headers: z.array(z.string().max(300)).min(1).max(50),
  keyColumn: z.number().int().min(0).optional(),
  detailLinkColumn: z.number().int().min(0).optional(),
  sort: z.object({
    column: z.number().int().min(0),
    direction: z.enum(['ascending', 'descending']),
    priority: z.array(z.string().trim().max(300)).max(50).transform(values => values.filter(Boolean)).optional(),
  }).optional(),
  rule: z.object({
    column: z.number().int().min(0),
    operator: z.enum(['contains', 'equals', 'greater_than', 'less_than', 'older_than_days']),
    value: z.string().trim().min(1).max(300),
  }).optional(),
  nextSelector: z.string().trim().max(1000).default(''),
  maxPages: z.number().int().min(1).max(20).default(1),
  maxRows: z.number().int().min(1).max(2000).default(1000),
}).superRefine((config, ctx) => {
  if (config.keyColumn !== undefined && config.keyColumn >= config.headers.length)
    ctx.addIssue({ code: 'custom', message: 'Record ID column is outside the table' });
  if (config.detailLinkColumn !== undefined && config.detailLinkColumn >= config.headers.length)
    ctx.addIssue({ code: 'custom', message: 'Record link column is outside the table' });
  if (config.sort && config.sort.column >= config.headers.length)
    ctx.addIssue({ code: 'custom', message: 'Sort column is outside the table' });
  if (config.rule && config.rule.column >= config.headers.length)
    ctx.addIssue({ code: 'custom', message: 'Rule column is outside the table' });
  if (config.rule && !['contains', 'equals'].includes(config.rule.operator)
    && (!Number.isFinite(Number(config.rule.value)) || (config.rule.operator === 'older_than_days' && Number(config.rule.value) < 0)))
    ctx.addIssue({ code: 'custom', message: 'Enter a valid numeric threshold' });
  if (config.maxPages > 1 && !config.nextSelector)
    ctx.addIssue({ code: 'custom', message: 'Select a next-page button for multiple pages' });
});
export type OfficeConfig = z.infer<typeof officeConfigSchema>;
export interface OfficeLink { url: string; name: string; }
export interface OfficeRow { key: string; cells: string[]; sourceUrl: string; detailUrl?: string; links: OfficeLink[]; }
export interface OfficeTable { selector: string; headers: string[]; sample: string[][]; }
export interface OfficePage { headers: string[]; rows: Omit<OfficeRow, 'key'>[]; url: string; truncated: boolean; }
export interface ArchiveFile extends OfficeLink {
  id: string;
  sourceUrl: string;
  filename?: string;
  downloadId?: number;
  status: 'ready' | 'starting' | 'downloading' | 'complete' | 'failed' | 'unknown';
  error?: string;
}
export interface OfficeReport {
  kind: 'office-report';
  config: OfficeConfig;
  sourceUrl: string;
  startedAt: number;
  complete: boolean;
  pages: number;
  scanned: number;
  rows: OfficeRow[];
  warnings: string[];
  files: ArchiveFile[];
  handledKeys?: string[];
  comparison?: { previousAt: number; added: string[]; changed: string[]; unchanged: string[]; noLongerMatched: OfficeRow[] };
}
