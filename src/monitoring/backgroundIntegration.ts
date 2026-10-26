import { MonitorRunner } from './MonitorRunner';
import { MonitorScheduler, MONITOR_ALARM_NAME } from './MonitorScheduler';
import { MonitorStore } from './MonitorStore';
import { installElementPicker, toElementSelection } from './elementPicker';
import { MONITOR_DEFAULT_SCHEDULE_MINUTES, type Monitor, type MonitorResponse } from './types';

const scheduler = new MonitorScheduler();
const store = MonitorStore.getInstance();

export function setupMonitoring(): void {
  scheduler.initialize().catch(() => console.error('[monitoring] initialization failed'));
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === MONITOR_ALARM_NAME) scheduler.tick().catch(() => console.error('[monitoring] tick failed')); });
  chrome.runtime.onInstalled.addListener(() => { scheduler.initialize().catch(() => undefined); });
  chrome.runtime.onStartup.addListener(() => { scheduler.initialize().catch(() => undefined); });
  chrome.notifications.onClicked.addListener(id => {
    if (!id.startsWith('monitor-')) return;
    const diffId = id.startsWith('monitor-diff:') ? id.slice('monitor-diff:'.length) : undefined;
    if (diffId) store.getDiff(diffId).then(diff => {
      if (diff) chrome.tabs.create({ url: chrome.runtime.getURL(`monitor-compare.html?monitorId=${encodeURIComponent(diff.monitorId)}&diffId=${encodeURIComponent(diff.id)}`), active: true });
    }).catch(() => undefined);
  });
}

export function isMonitorMessage(message: unknown): boolean {
  return !!message && typeof message === 'object' && typeof (message as { action?: unknown }).action === 'string' && (message as { action: string }).action.startsWith('monitor');
}

export async function handleMonitorMessage(message: any): Promise<MonitorResponse> {
  try {
    switch (message.action) {
      case 'monitorList': {
        const monitors = await store.listMonitors();
        const runs = await Promise.all(monitors.map(monitor => store.listRuns(monitor.id)));
        return ok(monitors.map((monitor, index) => ({
          ...monitor,
          isRunning: runs[index].some(run => run.status === 'running'),
        })));
      }
      case 'monitorGet': {
        const monitor = await store.getMonitor(message.monitorId);
        if (!monitor) return fail('INVALID_REQUEST', 'Monitor not found');
        return ok({ monitor, runs: (await store.listRuns(monitor.id)).sort((a, b) => b.startedAt - a.startedAt), snapshots: (await store.listSnapshots(monitor.id)).sort((a, b) => b.observedAt - a.observedAt), diffs: (await store.listDiffs(monitor.id)).sort((a, b) => b.createdAt - a.createdAt), screenshots: await store.listScreenshots(monitor.id) });
      }
      case 'monitorCompareGet': {
        const monitorId = String(message.monitorId ?? '');
        const diffId = String(message.diffId ?? '');
        if (!monitorId || !diffId) return fail('INVALID_REQUEST', 'Monitor and change IDs are required');
        const [monitor, diff] = await Promise.all([store.getMonitor(monitorId), store.getDiff(diffId)]);
        if (!monitor || !diff || diff.monitorId !== monitor.id) return fail('INVALID_REQUEST', 'This change is no longer available');
        const [before, after] = await Promise.all([store.getSnapshot(diff.previousSnapshotId), store.getSnapshot(diff.currentSnapshotId)]);
        if (!before || !after || before.monitorId !== monitor.id || after.monitorId !== monitor.id) return fail('INVALID_REQUEST', 'The snapshots for this change are no longer available');
        const [beforeScreenshot, afterScreenshot] = await Promise.all([
          before.screenshotId ? store.getScreenshot(before.screenshotId) : undefined,
          after.screenshotId ? store.getScreenshot(after.screenshotId) : undefined,
        ]);
        return ok({ monitor, diff, before, after,
          beforeScreenshot: beforeScreenshot?.monitorId === monitor.id && beforeScreenshot.snapshotId === before.id && typeof beforeScreenshot.data === 'string' ? beforeScreenshot.data : undefined,
          afterScreenshot: afterScreenshot?.monitorId === monitor.id && afterScreenshot.snapshotId === after.id && typeof afterScreenshot.data === 'string' ? afterScreenshot.data : undefined,
        });
      }
      case 'monitorPickElement': {
        const result = await chrome.scripting.executeScript({ target: { tabId: Number(message.tabId) }, func: installElementPicker });
        const raw = result[0]?.result;
        return raw ? ok(toElementSelection(raw)) : fail('INVALID_REQUEST', 'Element selection cancelled');
      }
      case 'monitorCreate': {
        const now = Date.now();
        const monitor: Monitor = { ...message.monitor, id: `monitor-${crypto.randomUUID()}`, kind: 'page_text', status: 'active', scheduleMinutes: MONITOR_DEFAULT_SCHEDULE_MINUTES, trigger: { type: 'changed' }, normalization: {}, readiness: {}, consecutiveFailures: 0, triggerActive: false, createdAt: now, updatedAt: now, nextRunAt: now };
        if (!monitor.name?.trim() || !monitor.url || !monitor.instruction?.trim()) return fail('INVALID_REQUEST', 'Name, URL, and monitoring instruction are required');
        try { const url = new URL(monitor.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { return fail('INVALID_REQUEST', 'Monitor URL must use HTTP or HTTPS'); }
        await store.saveMonitor(monitor);
        const run = await new MonitorRunner().run(monitor.id, 'creation');
        if (run.status === 'failed') { await store.deleteMonitor(monitor.id); return fail(run.errorCode ?? 'UNKNOWN', run.errorMessage ?? 'Baseline failed'); }
        return ok(await store.getMonitor(monitor.id));
      }
      case 'monitorRunNow': await scheduler.runNow(message.monitorId); return ok(true);
      case 'monitorPause': return ok(await updateStatus(message.monitorId, 'paused'));
      case 'monitorResume': return ok(await updateStatus(message.monitorId, 'active'));
      case 'monitorDelete': await store.deleteMonitor(message.monitorId); return ok(true);
      default: return fail('INVALID_REQUEST', 'Unknown monitor action');
    }
  } catch (error) {
    return fail('UNKNOWN', error instanceof Error ? error.message : String(error));
  }
}

async function updateStatus(id: string, status: Monitor['status']): Promise<Monitor> {
  const monitor = await store.getMonitor(id); if (!monitor) throw new Error('Monitor not found');
  const updated = { ...monitor, status, nextRunAt: status === 'active' ? Date.now() : monitor.nextRunAt, updatedAt: Date.now() };
  await store.saveMonitor(updated); return updated;
}
const ok = <T>(data: T): MonitorResponse<T> => ({ success: true, data });
const fail = (code: any, message: string): MonitorResponse => ({ success: false, error: { code, message } });

