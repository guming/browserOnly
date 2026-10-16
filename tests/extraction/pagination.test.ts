import { extractPaginatedRecords } from '../../src/extraction/paginatedExtractor';
import type { ExtractionResult } from '../../src/extraction/types';
const page = (id: number): ExtractionResult => ({ fields: [{ key: 'title', label: 'Title', type: 'text' }], rows: [{ title: String(id) }], sourceUrls: ['https://example.com'], warnings: [], generatedAt: 'now' });
test('collects five pages and never navigates after the fifth', async () => {
  let id = 1;
  const next = jest.fn(async () => { id++; return true; });
  const result = await extractPaginatedRecords(5, async () => page(id), next);
  expect(result.rows).toHaveLength(5); expect(result.pagesRead).toBe(5); expect(next).toHaveBeenCalledTimes(4);
});
test('retains partial results when next-page controls fail', async () => {
  const result = await extractPaginatedRecords(5, async () => page(1), async () => { throw new Error('Missing next'); });
  expect(result.rows).toHaveLength(1); expect(result.partial).toBe(true); expect(result.warnings).toContain('Missing next');
});
test('stops repeated pages and enforces the total row limit', async () => {
  const repeated = await extractPaginatedRecords(5, async () => page(1), async () => true);
  expect(repeated.pagesRead).toBe(1); expect(repeated.partial).toBe(true);
  let id = 0;
  const limited = await extractPaginatedRecords(5, async () => page(++id), async () => true, 2);
  expect(limited.rows).toHaveLength(2); expect(limited.pagesRead).toBe(2);
});
