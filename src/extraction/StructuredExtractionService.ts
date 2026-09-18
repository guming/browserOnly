import { ExtractionRequest, ExtractionResult } from './types';
import { extractionRequestSchema, validateExtractionResult } from './extractionSchema';

export class StructuredExtractionService {
  buildPrompt(request: ExtractionRequest): string {
    const valid = extractionRequestSchema.parse(request);
    return `Extract ${valid.fields.map((field) => `${field.key}: ${field.type}`).join(', ')} as JSON rows. Missing values must be null.`;
  }

  validate(value: unknown): ExtractionResult { return validateExtractionResult(value); }
}
