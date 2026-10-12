export type ExtractionSource = 'page' | 'selection' | 'tabs';
export type ExtractionFieldType = 'text' | 'number' | 'boolean' | 'date' | 'url';

export interface ExtractionField {
  key: string;
  label: string;
  type: ExtractionFieldType;
  description?: string;
  required?: boolean;
}

export interface ExtractionRequest {
  source: ExtractionSource;
  fields: ExtractionField[];
  maxRows?: number;
  outputFormat?: 'table' | 'json' | 'csv';
  urls?: string[];
  selectionText?: string;
  plan?: ExtractionPlan;
}

export interface ExtractionPlan {
  version: 1;
  sourceKind: 'table' | 'list' | 'repeated-block' | 'embedded-json';
  listSelector: string;
  itemSelector?: string;
  fields: Array<{ name: string; selector?: string; column?: number; required?: boolean }>;
  detailLinkSelector?: string;
  nextSelector?: string;
  maxPages: number;
  maxRows: number;
}

export interface ExtractionResult {
  fields: ExtractionField[];
  rows: Array<Record<string, unknown>>;
  sourceUrls: string[];
  warnings: string[];
  generatedAt: string;
  partial?: boolean;
  completeness?: number;
  plan?: ExtractionPlan;
}
