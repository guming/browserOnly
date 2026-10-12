import { ExtractionRequest, ExtractionResult } from './types';
import { extractionRequestSchema, validateExtractionResult } from './extractionSchema';
import type { ExtractionField } from './types';

export class StructuredExtractionService {
  buildPrompt(request: ExtractionRequest): string {
    const valid = extractionRequestSchema.parse(request);
    return `Return JSON only with a rows array. Extract ${valid.fields.map((field) => `${field.key}: ${field.type}`).join(', ')}. Missing values must be null. Never infer facts absent from the supplied candidates. Maximum rows: ${valid.maxRows}.`;
  }

  validate(value: unknown): ExtractionResult { return validateExtractionResult(value); }

  async normalizeWithRepair(request: ExtractionRequest, candidates: string[], normalize: (prompt: string) => Promise<string>): Promise<ExtractionResult> {
    const valid = extractionRequestSchema.parse(request);
    const prompt = `${this.buildPrompt(valid)}\nCandidates:\n${candidates.join('\n---\n')}`;
    let raw = await normalize(prompt);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const decoded = JSON.parse(raw);
        return this.validate({ fields: valid.fields, rows: Array.isArray(decoded) ? decoded : decoded.rows, sourceUrls: valid.urls ?? [], warnings: [], generatedAt: new Date().toISOString() });
      } catch (error) {
        if (attempt === 1) throw error;
        raw = await normalize(`Repair this into valid JSON with only a rows array. Do not add facts.\n${raw}`);
      }
    }
    throw new Error('Structured extraction failed');
  }

  suggestFields(description: string): ExtractionField[] {
    return description.split(/[,，\n]+/).map((label, index) => ({ key: keyFor(label, index), label: label.trim(), type: inferType(label), required: false })).filter(field => field.label);
  }
}

function keyFor(label: string, index: number): string { return label.trim().normalize('NFKD').replace(/[^a-zA-Z0-9]+(.)?/g, (_, next: string) => next ? next.toUpperCase() : '').replace(/^[^a-zA-Z]+/, '') || `field${index + 1}`; }
function inferType(label: string): ExtractionField['type'] { if (/price|rating|amount|count|数量|价格|评分/i.test(label)) return 'number'; if (/date|time|日期|时间/i.test(label)) return 'date'; if (/url|link|链接/i.test(label)) return 'url'; if (/stock|available|是否|库存/i.test(label)) return 'boolean'; return 'text'; }
