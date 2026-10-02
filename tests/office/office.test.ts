import { inspectOfficeTable } from '../../src/office/inspectionTool';
import { matchesOfficeRule, compareOfficeReports, reportCsv, safePathPart } from '../../src/office/report';
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
