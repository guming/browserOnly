import { extractionRequestSchema } from '../../src/extraction/extractionSchema';
import { toCsv } from '../../src/extraction/exporters';
import { extractDomCandidates, planFromCandidates } from '../../src/extraction/domCandidateExtractor';
import { StructuredExtractionService } from '../../src/extraction/StructuredExtractionService';

describe('structured extraction', () => {
  it('validates fields and limits rows', () => {
    expect(() => extractionRequestSchema.parse({ source: 'page', fields: [{ key: 'title', label: 'Title', type: 'text' }], maxRows: 100 })).not.toThrow();
    expect(() => extractionRequestSchema.parse({ source: 'page', fields: [] })).toThrow();
  });
  it('exports escaped CSV', () => {
    const csv = toCsv({ fields: [{ key: 'title', label: 'Title', type: 'text' }], rows: [{ title: 'a,b\n中文' }], sourceUrls: [], warnings: [], generatedAt: 'now' });
    expect(csv).toContain('"a,b\n中文"');
  });
  it('extracts table row candidates without scripts', () => {
    expect(extractDomCandidates('<script>x</script><table><tr><td>A</td></tr></table>')).toEqual([{ text: 'A' }]);
  });
  it('creates a bounded reusable plan only for repeated candidates', () => {
    const candidates = [{ text: 'A', selector: 'ul > li', kind: 'list' as const }, { text: 'B', selector: 'ul > li', kind: 'list' as const }];
    expect(planFromCandidates(candidates, [{ name: 'title', selector: '.title', required: true }], 500)).toMatchObject({ version: 1, sourceKind: 'list', itemSelector: 'ul > li', maxRows: 100 });
    expect(() => planFromCandidates(candidates.slice(0, 1), [{ name: 'title' }])).toThrow(/two structurally similar/);
  });
});

describe('StructuredExtractionService', () => {
  it('repairs invalid JSON once and normalizes missing required values', async () => {
    const normalize = jest.fn().mockResolvedValueOnce('bad').mockResolvedValueOnce('{"rows":[{"name":"A"}]}');
    const result = await new StructuredExtractionService().normalizeWithRepair({ source: 'page', fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'price', label: 'Price', type: 'number', required: true }], maxRows: 100 }, ['A'], normalize);
    expect(normalize).toHaveBeenCalledTimes(2);
    expect(result.rows[0].price).toBeNull();
    expect(result.partial).toBe(true);
  });
});
