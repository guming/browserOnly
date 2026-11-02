import { extractFieldsFromDom, browserExtractFields } from '../../../../src/agent/tools/structuredReadTools';
import { browserExtractLinks } from '../../../../src/agent/tools/observationTools';
jest.mock('../../../../src/agent/tools/utils', () => ({
  MAX_RETURN_CHARS: 20000,
  withActivePage: (page: any, fn: any) => fn(page),
  retryAfterNavigation: (_page: any, fn: any) => fn(),
}));
const fields = { title: { selector: 'span', source: 'text' as const }, href: { selector: 'a', source: 'attribute' as const, attribute: 'href' }, sku: { source: 'attribute' as const, attribute: 'data-sku' } };
const read = (limit = 50, offset = 0) => extractFieldsFromDom({ selector: '.card', fields, limit, offset });
beforeEach(() => { document.body.innerHTML = '<div class="card" data-sku="123"><span> 商品 一 </span><a href="/one">Open</a></div><div class="card"><span>二</span></div>'; });
it('reads fields, resolves href, and preserves nulls and provenance', () => {
  const result = read();
  expect(result.data[0]).toEqual({ title: '商品 一', href: new URL('/one', document.baseURI).href, sku: '123' });
  expect(result.data[1].href).toBeNull();
  expect(result.meta).toMatchObject({ totalCount: 2, returnedCount: 2, scope: 'current_dom', truncated: false });
});
it('paginates complete records and handles empty pages', () => {
  expect(read(1).meta.nextOffset).toBe(1);
  expect(read(1, 1).data[0].title).toBe('二');
  document.body.innerHTML = ''; expect(read().data).toEqual([]);
});
it('keeps JSON within budget and declares clipped fields', () => {
  document.body.innerHTML = Array.from({ length: 40 }, () => `<div class="card"><span>${'x'.repeat(2000)}</span></div>`).join('');
  const result = read();
  expect(JSON.stringify(result).length).toBeLessThanOrEqual(20000);
  expect(result.meta.truncated).toBe(true);
  expect(result.meta.truncatedFields[0].fields).toEqual(['title']);
  expect(result.meta.nextOffset).toBe(result.data.length);
});
it('returns a first record even when all twenty fields need escaping and clipping', () => {
  document.body.innerHTML = '<div class="card"></div>';
  document.querySelector('.card')!.textContent = '\u0001'.repeat(2000);
  const manyFields = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`field${i}`, { source: 'text' as const }]));
  const result = extractFieldsFromDom({ selector: '.card', fields: manyFields, limit: 50, offset: 0 });
  expect(result.data).toHaveLength(1);
  expect(JSON.stringify(result).length).toBeLessThanOrEqual(20000);
  expect(result.meta.truncatedFields[0].fields).toHaveLength(20);
  expect(result.meta.nextOffset).toBeNull();
});
it('rejects invalid input and selectors without evaluating user code', async () => {
  const page = { evaluate: async (fn: any, input: any) => fn(input) } as any;
  const tool = browserExtractFields(page);
  expect(JSON.parse(await tool.func('{"selector":".card","fields":{},"limit":0}')).error.code).toBe('INVALID_ARGUMENT');
  expect(JSON.parse(await tool.func(JSON.stringify({ selector: '[', fields }))).error.code).toBe('INVALID_ARGUMENT');
});
it('deduplicates and limits current DOM links including relative URLs', async () => {
  document.body.innerHTML = '<a href="/one">One</a><a href="/one">Duplicate</a><a href="https://other.example/two">Two</a>';
  const page = { evaluate: async (fn: any, input: any) => fn(input) } as any;
  const tool = browserExtractLinks(page);
  const result = JSON.parse(await tool.func('all limit=1'));
  expect(result.data).toHaveLength(1);
  expect(result.meta).toMatchObject({ totalCount: 2, returnedCount: 1, truncated: true, scope: 'current_dom' });
  expect(JSON.parse(await tool.func('internal')).data).toHaveLength(1);
  expect(JSON.parse(await tool.func('external')).data).toHaveLength(1);
  document.body.innerHTML = ''; expect(JSON.parse(await tool.func('all')).data).toEqual([]);
});

it('advances pagination with twenty maximum-length field names and clipped values', () => {
  document.body.innerHTML = '<div class="card"></div>';
  document.querySelector('.card')!.textContent = 'x'.repeat(2000);
  const longFields = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i).padStart(97, 'x'), { source: 'text' as const }]));
  const result = extractFieldsFromDom({ selector: '.card', fields: longFields, limit: 50, offset: 0 });
  expect(result.data).toHaveLength(1);
  expect(result.meta.nextOffset).toBeNull();
  expect(JSON.stringify(result).length).toBeLessThanOrEqual(20000);
});
