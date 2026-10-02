import { WorkflowStore } from '../workflows/WorkflowStore';
import { safePathPart } from './report';

const locks = new Set<string>();
export async function handleOfficeArchive(message: { action: string; stepRunId: string; runId: string; fileIds?: string[] }) {
  const key = message.stepRunId;
  if (locks.has(key)) throw new Error('Archive update is already in progress');
  locks.add(key);
  try {
    const store = WorkflowStore.getInstance();
    const run = await store.getRun(message.runId);
    if (!run || run.status === 'running') throw new Error('Wait for inspection to finish');
    const step = (await store.listStepRuns(run.id)).find(item => item.id === key);
    const report = step?.officeReport;
    if (!step || !report || report.config.mode !== 'archive') throw new Error('Archive report not found');
    for (const file of report.files) {
      if (file.downloadId !== undefined) {
        const [download] = await chrome.downloads.search({ id: file.downloadId });
        file.status = !download ? 'unknown' : download.state === 'complete' ? 'complete' : download.state === 'interrupted' ? 'failed' : 'downloading';
        file.error = download?.error;
      } else if (file.status === 'starting') { file.status = 'unknown'; file.error = 'Download dispatch was interrupted. Check Chrome downloads before trying again.'; }
    }
    if (message.action === 'officeArchiveDownload') {
      for (const file of report.files.filter(item => message.fileIds?.includes(item.id) && ['ready', 'failed'].includes(item.status))) {
        const url = new URL(file.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid file URL');
        file.filename = `BrowserOnly/${safePathPart(report.config.name)}/${new Date(report.startedAt).toISOString().slice(0, 10)}/${file.id}-${safePathPart(file.name)}`;
        file.status = 'starting';
        await store.saveStepRun(step);
        try {
          file.downloadId = await chrome.downloads.download({ url: file.url, filename: file.filename, conflictAction: 'uniquify', saveAs: false });
          file.status = 'downloading'; file.error = undefined;
        } catch (error) { file.status = 'failed'; file.error = error instanceof Error ? error.message : String(error); }
        await store.saveStepRun(step);
      }
    }
    await store.saveStepRun(step);
    return report;
  } finally { locks.delete(key); }
}
