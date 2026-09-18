import { extractionRequestSchema } from '../../src/extraction/extractionSchema';

describe('structured workflow tool contract', () => {
  it('requires at least one confirmed field', () => {
    expect(() => extractionRequestSchema.parse({ source: 'page', fields: [] })).toThrow();
  });
});
