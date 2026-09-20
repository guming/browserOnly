import { valueText } from './normalizers';
import type { Monitor, MonitorDiff } from './types';

const truncate = (value: string, length = 100) => value.length > length ? `${value.slice(0, length - 1)}…` : value;

export async function notifyMonitorChange(monitor: Monitor, diff: MonitorDiff): Promise<void> {
  const before = truncate(valueText(diff.previousValue));
  const after = truncate(valueText(diff.currentValue));
  await chrome.notifications.create(`monitor-diff:${diff.id}`, {
    type: 'basic', iconUrl: 'icons/icon128.png', title: `${monitor.name} changed`,
    message: `${before || '(empty)'} → ${after || '(empty)'}`,
  });
}

export async function notifyMonitorFailure(monitor: Monitor): Promise<void> {
  await chrome.notifications.create(`monitor-failure:${monitor.id}`, {
    type: 'basic', iconUrl: 'icons/icon128.png', title: `${monitor.name} needs attention`,
    message: 'Monitoring paused after three consecutive failures.',
  });
}

