import { MonitorRunner } from './MonitorRunner';
import { MonitorStore } from './MonitorStore';
import type { Monitor, MonitorRun, MonitorRunSource } from './types';

export const MONITOR_ALARM_NAME = 'browseronly-monitor-tick';

export interface MonitorSchedulerStore {
  listDueMonitors(now?: number): Promise<Monitor[]>;
  listMonitors(): Promise<Monitor[]>;
  listRuns(monitorId: string): Promise<MonitorRun[]>;
  saveRun(run: MonitorRun): Promise<void>;
}

export interface MonitorSchedulerRunner { run(monitorId: string, source: MonitorRunSource): Promise<MonitorRun>; }

export class MonitorScheduler {
  private readonly claims = new Set<string>();
  constructor(
    private readonly store: MonitorSchedulerStore = MonitorStore.getInstance(),
    private readonly runner: MonitorSchedulerRunner = new MonitorRunner(),
  ) {}

  async initialize(): Promise<void> {
    await chrome.alarms.create(MONITOR_ALARM_NAME, { periodInMinutes: 1 });
    await this.recoverStaleRuns();
  }

  async tick(): Promise<void> {
    const due = (await this.store.listDueMonitors()).filter(item => !this.claims.has(item.id)).slice(0, 2);
    await Promise.all(due.map(async monitor => {
      this.claims.add(monitor.id);
      try { await this.runner.run(monitor.id, 'schedule'); } finally { this.claims.delete(monitor.id); }
    }));
  }

  async runNow(monitorId: string): Promise<void> {
    if (this.claims.has(monitorId)) throw new Error('Monitor is already running');
    this.claims.add(monitorId);
    try { await this.runner.run(monitorId, 'manual'); } finally { this.claims.delete(monitorId); }
  }

  private async recoverStaleRuns(): Promise<void> {
    const monitors = await this.store.listMonitors();
    const cutoff = Date.now() - 10 * 60_000;
    for (const monitor of monitors) {
      for (const run of await this.store.listRuns(monitor.id)) {
        if (run.status === 'running' && run.startedAt < cutoff) await this.store.saveRun({ ...run, status: 'failed', endedAt: Date.now(), errorCode: 'TAB_CLOSED', errorMessage: 'Execution was interrupted' });
      }
    }
  }
}
