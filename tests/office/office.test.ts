import { inspectOfficeTable } from '../../src/office/inspectionTool';
import { matchesOfficeRule, compareOfficeReports, reportCsv, safePathPart, sortOfficeRows } from '../../src/office/report';
import { readOfficeTable } from '../../src/office/pageReader';
import { officeConfigSchema, OfficePage } from '../../src/office/types';
import { handleOfficeArchive } from '../../src/office/archive';
import { WorkflowStore } from '../../src/workflows/WorkflowStore';

const config = officeConfigSchema.parse({ mode: 'inspection', name: 'Follow-up', tableSelector: '#orders', headers: ['ID', 'Status'], keyColumn: 0, rule: { column: 1, operator: 'equals', value: 'pending' }, nextSelector: '#next', maxPages: 2 });
const page = (id: string, status = 'pending'): OfficePage => ({ headers: config.headers, url: 'https://example.com/orders', truncated: false, rows: [{ cells: [id, status], sourceUrl: 'https://example.com/orders', links: [] }] });

test('reads multiple stable pages, filters records and compares complete runs', async () => {
  let index = 0;
  const result = await inspectOfficeTable(config, { read: async () => page(String(index + 1)), next: async click => { if (index === 1) return false; if (click) index++; return true; }, wait: async () => {} });
  expect(result.complete).toBe(true); expect(result.scanned).toBe(2);
  const previous = { ...result, rows: [result.rows[0]], startedAt: result.startedAt - 1000 };
  expect(compareOfficeReports(result, previous)?.added).toEqual(['2']);
  expect(compareOfficeReports({ ...result, complete: false }, previous)).toBeUndefined();
});
test('pagination failure retains partial rows and suppresses comparison', async () => {
  const result = await inspectOfficeTable(config, { read: async () => page('1'), next: async () => { throw new Error('Missing next button'); }, wait: async () => {} });
  expect(result.complete).toBe(false); expect(result.rows).toHaveLength(1); expect(result.warnings).toContain('Missing next button');
});
test('cancellation prevents pagination and preserves progress', async () => {
  const abort = new AbortController(); const next = jest.fn();
  await expect(inspectOfficeTable(config, { read: async () => page('1'), next, wait: async () => {} }, { signal: abort.signal, onProgress: async () => { abort.abort(); } })).rejects.toThrow('cancelled');
  expect(next).not.toHaveBeenCalled();
});
test('unknown numeric and date values are not silently accepted', () => {
  expect(matchesOfficeRule(['USD 20'], { column: 0, operator: 'greater_than', value: '10' }, Date.now())).toBeUndefined();
  expect(matchesOfficeRule(['10/02/26'], { column: 0, operator: 'older_than_days', value: '2' }, Date.now())).toBeUndefined();
  expect(() => officeConfigSchema.parse({ ...config, rule: { column: 0, operator: 'greater_than', value: 'bad' } })).toThrow();
});
test('CSV neutralizes formulas and archive filenames cannot traverse directories', async () => {
  const report = await inspectOfficeTable({ ...config, nextSelector: '', maxPages: 1 }, { read: async () => page('=SUM(A1)'), next: async () => false, wait: async () => {} });
  expect(reportCsv(report)).toContain("'=SUM(A1)"); expect(safePathPart('../../secret')).not.toContain('/'); expect(safePathPart('CON')).toBe('file-CON');
});
test('archive refresh recognizes completed downloads and avoids duplicate dispatch', async () => {
  const report = await inspectOfficeTable({ ...config, mode: 'archive', nextSelector: '', maxPages: 1 }, { read: async () => ({ ...page('1'), rows: [{ ...page('1').rows[0], links: [{ url: 'https://example.com/file.pdf', name: 'file.pdf' }] }] }), next: async () => false, wait: async () => {} });
  const step = { id: 'step', runId: 'run', officeReport: report };
  jest.spyOn(WorkflowStore, 'getInstance').mockReturnValue({ getRun: async () => ({ id: 'run', status: 'succeeded' }), listStepRuns: async () => [step], saveStepRun: async () => {} } as any);
  (chrome as any).downloads = { download: jest.fn().mockResolvedValue(10), search: jest.fn().mockResolvedValue([{ state: 'complete' }]) };
  const request = { action: 'officeArchiveDownload', stepRunId: 'step', runId: 'run', fileIds: ['file-1'] };
  await handleOfficeArchive(request); await handleOfficeArchive(request);
  expect(chrome.downloads.download).toHaveBeenCalledTimes(1); expect(report.files[0].status).toBe('complete');
  jest.restoreAllMocks();
});

test('priority sorting places named levels first without changing collected records', () => {
  const rows = ['Standard', 'Unknown', 'VIP', 'Premium', 'VIP'].map((level, index) => ({ key: String(index), cells: [String(index), level], sourceUrl: 'https://example.com', links: [] }));
  expect(sortOfficeRows(rows, { column: 1, direction: 'descending', priority: ['VIP', 'Premium', 'Standard'] }).map(row => row.key)).toEqual(['2', '4', '3', '0', '1']);
  expect(rows.map(row => row.key)).toEqual(['0', '1', '2', '3', '4']);
  expect(sortOfficeRows(rows, { column: 0, direction: 'descending' })[0].key).toBe('4');
});

test('record links come only from the selected column and ambiguous links fall back to the list', () => {
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 20 } as DOMRect);
  document.body.innerHTML = '<table id="records"><tr><th>ID</th><th>Files</th></tr><tr><td><a href="https://example.com/ticket/1">1</a></td><td><a href="https://example.com/file.pdf">PDF</a></td></tr></table>';
  const result = readOfficeTable({ selector: '#records', limit: 10, detailLinkColumn: 0 });
  expect(result.rows[0].detailUrl).toBe('https://example.com/ticket/1');
  expect(result.rows[0].links).toEqual([{ url: 'https://example.com/file.pdf', name: 'file.pdf' }]);
  document.querySelector('td')!.insertAdjacentHTML('beforeend', '<a href="https://example.com/ticket/2">2</a>');
  expect(readOfficeTable({ selector: '#records', limit: 10, detailLinkColumn: 0 }).rows[0].detailUrl).toBeUndefined();
  jest.restoreAllMocks();
});

test('completed inspection applies saved priority order and config edits reset comparison', async () => {
  const sortedConfig = { ...config, rule: undefined, nextSelector: '', maxPages: 1, sort: { column: 1, direction: 'ascending' as const, priority: ['VIP', 'Standard'] } };
  const result = await inspectOfficeTable(sortedConfig, { read: async () => ({ ...page('1'), rows: [page('1', 'Standard').rows[0], page('2', 'VIP').rows[0]] }), next: async () => false, wait: async () => {} });
  expect(result.rows.map(row => row.key)).toEqual(['2', '1']);
  expect(compareOfficeReports(result, { ...result, config: { ...sortedConfig, sort: undefined } })).toBeUndefined();
});
