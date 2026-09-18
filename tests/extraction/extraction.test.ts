import { extractionRequestSchema } from '../../src/extraction/extractionSchema';
import { toCsv } from '../../src/extraction/exporters';
import { extractDomCandidates } from '../../src/extraction/domCandidateExtractor';

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
});
