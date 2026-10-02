import type { BrowserTool, ToolExecutionContext } from '../agent/tools/types';
import { WorkflowStore } from '../workflows/WorkflowStore';
import { officeConfigSchema, type OfficeConfig, type OfficePage, type OfficeReport } from './types';
import { readOfficeTable, officeNextPage } from './pageReader';
import { addArchiveFiles, compareOfficeReports, matchesOfficeRule } from './report';

export interface InspectionAccess {
  read: () => Promise<OfficePage>;
  next: (click: boolean) => Promise<boolean>;
  wait: () => Promise<void>;
}

/** A bounded workflow tool, using the existing runner for persistence and cancellation. */
export async function inspectOfficeTable(config: OfficeConfig, access: InspectionAccess, context?: ToolExecutionContext): Promise<OfficeReport> {
  const report: OfficeReport = { kind: 'office-report', config, sourceUrl: '', startedAt: Date.now(), complete: true, pages: 0, scanned: 0, rows: [], warnings: [], files: [] };
  const seenPages = new Set<string>();
  const seenKeys = new Set<string>();
  const checkCancelled = () => { if (context?.signal?.aborted) throw new Error('Inspection cancelled. Collected results are retained.'); };
  const warn = (message: string) => { report.complete = false; if (!report.warnings.includes(message)) report.warnings.push(message); };
  const progress = async () => context?.onProgress?.(JSON.stringify({ ...report, complete: false }));
  let precedingFingerprint: string | undefined;
  try {
    for (let pageIndex = 0; pageIndex < config.maxPages; pageIndex++) {
      checkCancelled();
      let page: OfficePage | undefined;
      let stable = '';
      let readError = '';
      // Two matching samples avoid capturing a table halfway through rendering.
      for (let poll = 0; poll < 16; poll++) {
        checkCancelled();
        try {
          const candidate = await access.read();
          const fingerprint = JSON.stringify(candidate.rows.map(row => row.cells));
          if (fingerprint !== precedingFingerprint && fingerprint === stable) { page = candidate; break; }
          stable = fingerprint;
        } catch (error) { stable = ''; readError = error instanceof Error ? error.message : String(error); }
        await access.wait();
      }
      checkCancelled();
      if (!page) throw new Error(readError || 'Table did not settle or pagination did not advance.');
      if (JSON.stringify(page.headers) !== JSON.stringify(config.headers)) throw new Error('Table headers changed. Re-select the table before running again.');
      if (report.sourceUrl && new URL(page.url).origin !== new URL(report.sourceUrl).origin) throw new Error('Navigation left the original site.');
      const fingerprint = JSON.stringify(page.rows.map(row => row.cells));
      if (seenPages.has(fingerprint)) throw new Error('Repeated page detected. Stopped to avoid duplicate records.');
      seenPages.add(fingerprint); precedingFingerprint = fingerprint;
      report.sourceUrl ||= page.url;
      report.pages++;
      if (page.truncated) warn('The page exceeded the row or cell limit. Results are partial.');
      for (const row of page.rows) {
        if (report.scanned >= config.maxRows) { warn('Row limit reached. Results are partial.'); break; }
        report.scanned++;
        const key = config.keyColumn === undefined ? `${report.pages}:${report.scanned}` : row.cells[config.keyColumn]?.trim();
        if (!key || seenKeys.has(key)) { warn('Missing or duplicate record IDs found. Choose a unique ID column; these rows were skipped.'); continue; }
        seenKeys.add(key);
        const matches = matchesOfficeRule(row.cells, config.rule, report.startedAt);
        if (matches === undefined) { warn('Some values could not be evaluated. Numeric rules need plain numbers; age rules need ISO dates.'); continue; }
        if (!matches) continue;
        const resultRow = { ...row, key };
        report.rows.push(resultRow);
        if (config.mode === 'archive') addArchiveFiles(report, resultRow);
      }
      await progress();
      checkCancelled();
      if (!config.nextSelector) break;
      if (!(await access.next(false))) break;
      if (pageIndex + 1 >= config.maxPages || report.scanned >= config.maxRows) { warn('More pages are available. Increase the page or row limit to include them.'); break; }
      checkCancelled();
      await access.next(true);
    }
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
    await progress();
    if (!report.pages || context?.signal?.aborted) throw error;
  }
  return report;
}

export function createOfficeInspectionTool(getTabId: () => number | undefined, workflowId: string): BrowserTool {
  return { name: 'browser_inspect_office_table', description: 'Inspect a configured table, filter rows, compare runs, and list downloadable documents.',
    func: async (input, context) => {
      const config = officeConfigSchema.parse(JSON.parse(input));
      const tabId = getTabId();
      if (tabId === undefined) throw new Error('No workflow tab');
      const report = await inspectOfficeTable(config, {
        read: async () => {
          const results = await chrome.scripting.executeScript({ target: { tabId }, func: readOfficeTable, args: [{ selector: config.tableSelector, limit: config.maxRows }] });
          if (!results[0]?.result) throw new Error('Unable to read table. Check login and page access.');
          return results[0].result;
        },
        next: async click => {
          const results = await chrome.scripting.executeScript({ target: { tabId }, func: officeNextPage, args: [{ selector: config.nextSelector, click }] });
          if (typeof results[0]?.result !== 'boolean') throw new Error('Unable to inspect next-page control.');
          return results[0].result;
        },
        wait: () => new Promise(resolve => setTimeout(resolve, 500)),
      }, context);
      const store = WorkflowStore.getInstance();
      const previousRuns = (await store.listRuns(workflowId)).filter(run => run.status === 'succeeded').sort((a, b) => b.startedAt - a.startedAt);
      if (previousRuns[0]) {
        const previous = (await store.listStepRuns(previousRuns[0].id)).find(step => step.officeReport)?.officeReport;
        report.comparison = compareOfficeReports(report, previous);
      }
      return JSON.stringify(report);
    },
  };
}
