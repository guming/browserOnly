import { WorkflowStore } from '../workflows/WorkflowStore';
import type { OfficeReport, OfficeRow } from './types';

interface HandledRecord { key: string; fingerprint: string; }
interface HandledState { scope: string; records: HandledRecord[]; }
const locks = new Set<string>();
const storageKey = (workflowId: string) => `office-handled:${workflowId}`;
const scope = (report: OfficeReport) => JSON.stringify([report.sourceUrl, report.config]);
const fingerprint = (row: OfficeRow) => JSON.stringify([row.cells, row.detailUrl]);

/** Acknowledgment applies to this exact observation, never to future changed records. */
export async function applyHandledRecords(workflowId: string, report: OfficeReport): Promise<void> {
  if (report.config.keyColumn === undefined) return;
  const key = storageKey(workflowId);
  const state = (await chrome.storage.local.get(key))[key] as HandledState | undefined;
  report.handledKeys = state?.scope === scope(report)
    ? report.rows.filter(row => state.records.some(record => record.key === row.key && record.fingerprint === fingerprint(row))).map(row => row.key)
    : [];
}

export async function handleOfficeRecord(message: { runId: string; stepRunId: string; recordKey: string; handled: boolean }): Promise<OfficeReport> {
  if (typeof message.recordKey !== 'string' || typeof message.handled !== 'boolean') throw new Error('Choose a record and a valid handled state.');
  const store = WorkflowStore.getInstance();
  const run = await store.getRun(message.runId);
  if (!run || run.status === 'running' || run.status === 'repairing') throw new Error('Wait for this run to finish before marking records.');
  if (locks.has(run.workflowId)) throw new Error('Another record update is being saved. Try again.');
  locks.add(run.workflowId);
  try {
    const step = (await store.listStepRuns(run.id)).find(item => item.id === message.stepRunId);
    const report = step?.officeReport;
    if (!step || !report || report.config.mode !== 'inspection' || report.config.keyColumn === undefined) throw new Error('Choose a unique record ID in the saved task before marking records.');
    const row = report.rows.find(item => item.key === message.recordKey);
    if (!row) throw new Error('This record is no longer in the report. Refresh the results.');
    const key = storageKey(run.workflowId);
    const previous = (await chrome.storage.local.get(key))[key] as HandledState | undefined;
    const records = previous?.scope === scope(report) ? previous.records.filter(item => item.key !== row.key) : [];
    if (message.handled) records.push({ key: row.key, fingerprint: fingerprint(row) });
    await chrome.storage.local.set({ [key]: { scope: scope(report), records: records.slice(-2000) } });
    await applyHandledRecords(run.workflowId, report);
    await store.saveStepRun(step);
    return report;
  } finally { locks.delete(run.workflowId); }
}
