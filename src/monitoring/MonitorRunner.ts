import { createDiff } from './DiffEngine';
import { extractElementInPage, extractPageTextInPage, locatorCandidates } from './MonitorExtractor';
import { MonitorStore } from './MonitorStore';
import { notifyMonitorChange, notifyMonitorFailure } from './NotificationService';
import { evaluateTrigger } from './TriggerEvaluator';
import { hashText, normalizePrice, normalizeStock, normalizeText, valueText } from './normalizers';
import type { Monitor, MonitorErrorCode, MonitorRun, MonitorRunSource, MonitorSnapshot } from './types';

const store = MonitorStore.getInstance();

export class MonitorRunner {
  async run(monitorId: string, source: MonitorRunSource): Promise<MonitorRun> {
    const monitor = await store.getMonitor(monitorId);
    if (!monitor) throw new Error('Monitor not found');
    const run: MonitorRun = { id: `monitor-run-${crypto.randomUUID()}`, monitorId, source, status: 'running', startedAt: Date.now() };
    await store.saveRun(run);
    let tabId: number | undefined;
    try {
      if (monitor.kind !== 'page_text' && !monitor.locator) throw coded('LOCATOR_NOT_FOUND', 'Monitor has no element locator');
      const tab = await chrome.tabs.create({ url: monitor.url, active: false });
      tabId = tab.id;
      if (tabId === undefined) throw coded('TAB_CLOSED', 'Browser did not create an execution tab');
      await waitForTab(tabId, 30_000);
      await delay(1_000);
      if (monitor.readiness.waitForText) await waitForText(tabId, monitor.readiness.waitForText, 15_000);
      const injection = monitor.kind === 'page_text'
        ? await chrome.scripting.executeScript({ target: { tabId }, func: extractPageTextInPage })
        : await chrome.scripting.executeScript({ target: { tabId }, func: extractElementInPage, args: [locatorCandidates(monitor.locator!), monitor.kind === 'stock'] });
      const extracted = injection[0]?.result;
      if (!extracted) throw coded('LOCATOR_NOT_FOUND', 'Element could not be read');
      const normalizedValue = monitor.kind === 'price' ? normalizePrice(extracted.value)
        : monitor.kind === 'stock' ? normalizeStock(extracted.found, extracted.value, monitor.normalization.stockIndicatorMeans)
        : normalizeText(extracted.value, monitor.kind === 'page_text' ? 200_000 : 20_000);
      const snapshot: MonitorSnapshot = {
        id: `snapshot-${crypto.randomUUID()}`, monitorId, runId: run.id, observedAt: Date.now(),
        url: extracted.url, pageTitle: extracted.title, kind: monitor.kind, rawValue: extracted.value.slice(0, 20_000),
        normalizedValue, contentHash: hashText(valueText(normalizedValue)), locatorUsed: extracted.locatorUsed,
      };
      const previous = await store.latestSnapshot(monitorId);
      await store.saveSnapshot(snapshot);
      run.snapshotId = snapshot.id;
      const diff = previous ? createDiff(previous, snapshot) : undefined;
      if (diff) { await store.saveDiff(diff); run.diffId = diff.id; }
      if (!previous || diff?.changed) await this.captureScreenshot(tabId, monitorId, snapshot).catch(() => undefined);
      const trigger = evaluateTrigger(monitor.trigger, normalizedValue, diff, monitor.triggerActive);
      run.status = diff?.changed ? 'changed' : 'unchanged';
      run.endedAt = Date.now();
      const updated: Monitor = { ...monitor, lastCheckedAt: run.endedAt, lastSuccessfulAt: run.endedAt, nextRunAt: run.endedAt + monitor.scheduleMinutes * 60_000, consecutiveFailures: 0, triggerActive: trigger.nextTriggerActive, updatedAt: run.endedAt };
      await Promise.all([store.saveRun(run), store.saveMonitor(updated)]);
      await store.cleanupMonitor(monitorId);
      if (trigger.shouldNotify && diff) await notifyMonitorChange(updated, diff);
    } catch (error) {
      const parsed = parseError(error);
      run.status = 'failed'; run.endedAt = Date.now(); run.errorCode = parsed.code; run.errorMessage = parsed.message;
      const failures = monitor.consecutiveFailures + 1;
      const updated: Monitor = { ...monitor, lastCheckedAt: run.endedAt, consecutiveFailures: failures, status: failures >= 3 ? 'needs_attention' : monitor.status, nextRunAt: run.endedAt + monitor.scheduleMinutes * 60_000, updatedAt: run.endedAt };
      await Promise.all([store.saveRun(run), store.saveMonitor(updated)]);
      if (failures === 3) await notifyMonitorFailure(updated).catch(() => undefined);
    } finally {
      if (tabId !== undefined) await chrome.tabs.remove(tabId).catch(() => undefined);
      chrome.runtime.sendMessage({ action: 'monitorRunUpdated', monitorId }).catch(() => undefined);
    }
    return run;
  }

  private async captureScreenshot(tabId: number, monitorId: string, snapshot: MonitorSnapshot): Promise<void> {
    const target = { tabId };
    await chrome.debugger.attach(target, '1.3');
    try {
      const result = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', { format: 'jpeg', quality: 70 }) as { data?: string };
      if (!result.data) return;
      const id = `screenshot-${crypto.randomUUID()}`;
      await store.saveScreenshot({ id, monitorId, snapshotId: snapshot.id, createdAt: Date.now(), data: `data:image/jpeg;base64,${result.data}` });
      snapshot.screenshotId = id; await store.saveSnapshot(snapshot);
    } finally { await chrome.debugger.detach(target).catch(() => undefined); }
  }
}

function waitForTab(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(coded('PAGE_TIMEOUT', 'Page did not load within 30 seconds')); }, timeoutMs);
    const listener = (updatedId: number, info: chrome.tabs.TabChangeInfo) => { if (updatedId === tabId && info.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab => { if (tab.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(); } }).catch(() => undefined);
  });
}

async function waitForText(tabId: number, text: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await chrome.scripting.executeScript({ target: { tabId }, func: (wanted: string) => (document.body?.innerText ?? '').includes(wanted), args: [text] });
    if (result[0]?.result) return;
    await delay(500);
  }
  throw coded('PAGE_TIMEOUT', `Readiness text did not appear: ${text}`);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function coded(code: MonitorErrorCode, message: string): Error { const error = new Error(message); error.name = code; return error; }
function parseError(error: unknown): { code: MonitorErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const named = error instanceof Error ? error.name : '';
  const known: MonitorErrorCode[] = ['NAVIGATION_FAILED', 'PAGE_TIMEOUT', 'LOCATOR_NOT_FOUND', 'MULTIPLE_MATCHES', 'PARSE_FAILED', 'AUTH_REQUIRED', 'CAPTCHA_DETECTED', 'TAB_CLOSED', 'UNKNOWN'];
  const embedded = known.find(code => named === code || message.includes(code));
  return { code: embedded ?? 'UNKNOWN', message: message.replace(/\?.*$/, '').slice(0, 500) };
}
