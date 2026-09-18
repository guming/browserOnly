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
}

export interface ExtractionResult {
  fields: ExtractionField[];
  rows: Array<Record<string, unknown>>;
  sourceUrls: string[];
  warnings: string[];
  generatedAt: string;
}
