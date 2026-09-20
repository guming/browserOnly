import { MonitorRunner } from './MonitorRunner';
import { MonitorScheduler, MONITOR_ALARM_NAME } from './MonitorScheduler';
import { MonitorStore } from './MonitorStore';
import { installElementPicker, toElementSelection } from './elementPicker';
import { MONITOR_DEFAULT_SCHEDULE_MINUTES, MONITOR_MAX_SCHEDULE_MINUTES, MONITOR_MIN_SCHEDULE_MINUTES, type Monitor, type MonitorResponse } from './types';

const scheduler = new MonitorScheduler();
const store = MonitorStore.getInstance();

export function setupMonitoring(): void {
  scheduler.initialize().catch(() => console.error('[monitoring] initialization failed'));
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === MONITOR_ALARM_NAME) scheduler.tick().catch(() => console.error('[monitoring] tick failed')); });
  chrome.runtime.onInstalled.addListener(() => { scheduler.initialize().catch(() => undefined); });
  chrome.runtime.onStartup.addListener(() => { scheduler.initialize().catch(() => undefined); });
  chrome.notifications.onClicked.addListener(id => {
    if (!id.startsWith('monitor-')) return;
    chrome.storage.local.set({ pendingMonitorNotification: id }).catch(() => undefined);
    const diffId = id.startsWith('monitor-diff:') ? id.slice('monitor-diff:'.length) : undefined;
    if (diffId) store.getDiff(diffId).then(diff => diff && store.getMonitor(diff.monitorId)).then(monitor => { if (monitor) chrome.tabs.create({ url: monitor.url, active: true }); }).catch(() => undefined);
  });
}

export function isMonitorMessage(message: unknown): boolean {
  return !!message && typeof message === 'object' && typeof (message as { action?: unknown }).action === 'string' && (message as { action: string }).action.startsWith('monitor');
}

export async function handleMonitorMessage(message: any): Promise<MonitorResponse> {
  try {
    switch (message.action) {
      case 'monitorList': return ok(await store.listMonitors());
      case 'monitorGet': {
        const monitor = await store.getMonitor(message.monitorId);
        if (!monitor) return fail('INVALID_REQUEST', 'Monitor not found');
        return ok({ monitor, runs: (await store.listRuns(monitor.id)).sort((a, b) => b.startedAt - a.startedAt), snapshots: (await store.listSnapshots(monitor.id)).sort((a, b) => b.observedAt - a.observedAt), diffs: (await store.listDiffs(monitor.id)).sort((a, b) => b.createdAt - a.createdAt), screenshots: await store.listScreenshots(monitor.id) });
      }
      case 'monitorPickElement': {
        const result = await chrome.scripting.executeScript({ target: { tabId: Number(message.tabId) }, func: installElementPicker });
        const raw = result[0]?.result;
        return raw ? ok(toElementSelection(raw)) : fail('INVALID_REQUEST', 'Element selection cancelled');
      }
      case 'monitorCreate': {
        const scheduleMinutes = Number(message.monitor?.scheduleMinutes ?? MONITOR_DEFAULT_SCHEDULE_MINUTES);
        if (scheduleMinutes < MONITOR_MIN_SCHEDULE_MINUTES || scheduleMinutes > MONITOR_MAX_SCHEDULE_MINUTES) return fail('INVALID_REQUEST', 'Schedule must be between 1 and 43,200 minutes');
        const now = Date.now();
        const kind = ['text', 'price', 'stock', 'page_text'].includes(message.monitor?.kind) ? message.monitor.kind : 'text';
        const monitor: Monitor = { ...message.monitor, id: `monitor-${crypto.randomUUID()}`, kind, status: 'active', scheduleMinutes, normalization: message.monitor?.normalization ?? {}, readiness: message.monitor?.readiness ?? {}, consecutiveFailures: 0, triggerActive: false, createdAt: now, updatedAt: now, nextRunAt: now };
        if (!monitor.name?.trim() || !monitor.url || (monitor.kind !== 'page_text' && !monitor.locator)) return fail('INVALID_REQUEST', 'Name, URL, and selected element are required');
        try { const url = new URL(monitor.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { return fail('INVALID_REQUEST', 'Monitor URL must use HTTP or HTTPS'); }
        if (!validTrigger(monitor)) return fail('INVALID_REQUEST', `Trigger ${monitor.trigger.type} is not valid for ${monitor.kind}`);
        if (monitor.kind === 'stock' && !monitor.normalization.stockIndicatorMeans) return fail('INVALID_REQUEST', 'Stock indicator meaning is required');
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

function validTrigger(monitor: Monitor): boolean {
  const allowed: Record<Monitor['kind'], string[]> = {
    text: ['changed', 'text_appears', 'text_disappears'],
    page_text: ['changed', 'text_appears', 'text_disappears'],
    price: ['changed', 'price_decreases', 'price_increases', 'price_below', 'price_above'],
    stock: ['changed', 'back_in_stock', 'out_of_stock'],
  };
  return allowed[monitor.kind].includes(monitor.trigger.type);
}
