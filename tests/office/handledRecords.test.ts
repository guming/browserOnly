import { applyHandledRecords, handleOfficeRecord } from '../../src/office/handledRecords';
import { WorkflowStore } from '../../src/workflows/WorkflowStore';
import { officeConfigSchema, type OfficeReport } from '../../src/office/types';

const makeReport = (): OfficeReport => ({ kind: 'office-report', config: officeConfigSchema.parse({ mode: 'inspection', name: 'Follow-up', tableSelector: '#tickets', headers: ['ID', 'Status'], keyColumn: 0 }), sourceUrl: 'https://example.com/tickets', startedAt: 1, complete: true, pages: 1, scanned: 1, rows: [{ key: '1', cells: ['1', 'pending'], sourceUrl: 'https://example.com/tickets', links: [] }], warnings: [], files: [] });

afterEach(() => jest.restoreAllMocks());

test('mark, repeat run, changed record and undo follow the exact saved observation', async () => {
  const data: Record<string, unknown> = {};
  jest.spyOn(chrome.storage.local, 'get').mockImplementation(async (key: any) => ({ [key]: data[key] }));
  jest.spyOn(chrome.storage.local, 'set').mockImplementation(async values => { Object.assign(data, values); });
  const report = makeReport();
  const step = { id: 'step', officeReport: report };
  jest.spyOn(WorkflowStore, 'getInstance').mockReturnValue({ getRun: async () => ({ id: 'run', workflowId: 'workflow', status: 'succeeded' }), listStepRuns: async () => [step], saveStepRun: async () => {} } as any);
  expect((await handleOfficeRecord({ runId: 'run', stepRunId: 'step', recordKey: '1', handled: true })).handledKeys).toEqual(['1']);
  const next = makeReport();
  await applyHandledRecords('workflow', next);
  expect(next.handledKeys).toEqual(['1']);
  next.rows[0].cells[1] = 'escalated';
  await applyHandledRecords('workflow', next);
  expect(next.handledKeys).toEqual([]);
  await applyHandledRecords('different-workflow', report);
  expect(report.handledKeys).toEqual([]);
  await handleOfficeRecord({ runId: 'run', stepRunId: 'step', recordKey: '1', handled: false });
  await applyHandledRecords('workflow', next);
  expect(next.handledKeys).toEqual([]);
});

test('running reports cannot be acknowledged', async () => {
  jest.spyOn(WorkflowStore, 'getInstance').mockReturnValue({ getRun: async () => ({ status: 'running' }) } as any);
  await expect(handleOfficeRecord({ runId: 'run', stepRunId: 'step', recordKey: '1', handled: true })).rejects.toThrow('finish');
});
