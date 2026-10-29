import { valueText } from './normalizers';
import type { Monitor, MonitorDiff } from './types';

const truncate = (value: string, length = 100) => value.length > length ? `${value.slice(0, length - 1)}…` : value;

export async function notifyMonitorChange(monitor: Monitor, diff: MonitorDiff): Promise<void> {
  if (monitor.kind === 'page_text' && (diff.addedText?.length || diff.removedText?.length)) {
    const changes = [
      diff.removedText?.length ? `Removed: ${truncate(diff.removedText.join(' '))}` : '',
      diff.addedText?.length ? `Added: ${truncate(diff.addedText.join(' '))}` : '',
    ].filter(Boolean);
    await chrome.notifications.create(`monitor-diff:${diff.id}`, {
      type: 'basic', iconUrl: 'icons/icon128.png', title: `${monitor.name} changed`,
      message: changes.join(' | '),
    });
    return;
  }
  const before = truncate(valueText(diff.previousValue));
  const after = truncate(valueText(diff.currentValue));
  await chrome.notifications.create(`monitor-diff:${diff.id}`, {
    type: 'basic', iconUrl: 'icons/icon128.png', title: `${monitor.name} changed`,
    message: `${before || '(empty)'} → ${after || '(empty)'}`,
  });
}

export async function notifySlackMonitorChange(monitor: Monitor, diff: MonitorDiff): Promise<void> {
  const settings = await chrome.storage.local.get({ slackMonitorEnabled: false, slackBotToken: '', slackChannel: 'auto-web' });
  if (!settings.slackMonitorEnabled) return;

  let delivery: { ok: boolean; error?: string; sentAt: number };
  try {
    const token = String(settings.slackBotToken ?? '').trim();
    const channel = String(settings.slackChannel ?? '').trim().replace(/^#/, '');
    if (!token || !channel) throw new Error('Set the Slack Bot Token and channel in Settings → Connections.');
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        channel: `#${channel}`,
        text: `*${monitor.name} changed*\n${truncate(valueText(diff.previousValue)) || '(empty)'} → ${truncate(valueText(diff.currentValue)) || '(empty)'}\n${monitor.url}`,
      }),
    });
    const result = await response.json() as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) throw new Error(result.error ?? `Slack returned HTTP ${response.status}`);
    delivery = { ok: true, sentAt: Date.now() };
  } catch (error) {
    delivery = { ok: false, error: error instanceof Error ? error.message : String(error), sentAt: Date.now() };
  }
  await chrome.storage.local.set({ slackMonitorLastDelivery: delivery });
}

export async function notifyMonitorFailure(monitor: Monitor): Promise<void> {
  await chrome.notifications.create(`monitor-failure:${monitor.id}`, {
    type: 'basic', iconUrl: 'icons/icon128.png', title: `${monitor.name} needs attention`,
    message: 'Monitoring paused after three consecutive failures.',
  });
}

