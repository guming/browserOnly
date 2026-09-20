import { MonitorScheduler } from '../../src/monitoring/MonitorScheduler';
import type { Monitor, MonitorRun } from '../../src/monitoring/types';

const monitor = (id: string): Monitor => ({ id, name: id, url: 'https://example.com', kind: 'text', status: 'active', locator: { css: '#value', fallbackOrder: ['css'] }, scheduleMinutes: 30, trigger: { type: 'changed' }, normalization: {}, readiness: {}, consecutiveFailures: 0, triggerActive: false, createdAt: 1, updatedAt: 1, nextRunAt: 1 });
const completedRun = (monitorId: string): MonitorRun => ({ id: `run-${monitorId}`, monitorId, source: 'schedule', status: 'unchanged', startedAt: 1, endedAt: 2 });

describe('MonitorScheduler', () => {
  test('runs at most two due monitors in one tick', async () => {
    const due = Array.from({ length: 100 }, (_, index) => monitor(String(index)));
    const store = { listDueMonitors: jest.fn().mockResolvedValue(due), listMonitors: jest.fn().mockResolvedValue([]), listRuns: jest.fn(), saveRun: jest.fn() };
    const runner = { run: jest.fn((id: string) => Promise.resolve(completedRun(id))) };
    await new MonitorScheduler(store, runner).tick();
    expect(runner.run.mock.calls.map(call => call[0])).toEqual(['0', '1']);
  });

  test('does not claim the same running monitor twice', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const store = { listDueMonitors: jest.fn().mockResolvedValue([monitor('a')]), listMonitors: jest.fn().mockResolvedValue([]), listRuns: jest.fn(), saveRun: jest.fn() };
    const runner = { run: jest.fn(async () => { await pending; return completedRun('a'); }) };
    const scheduler = new MonitorScheduler(store, runner);
    const first = scheduler.tick(); await Promise.resolve(); await scheduler.tick();
    expect(runner.run).toHaveBeenCalledTimes(1); finish(); await first;
  });

  test('marks stale runs failed during initialization', async () => {
    const stale: MonitorRun = { id: 'stale', monitorId: 'a', source: 'schedule', status: 'running', startedAt: Date.now() - 11 * 60_000 };
    const store = { listDueMonitors: jest.fn(), listMonitors: jest.fn().mockResolvedValue([monitor('a')]), listRuns: jest.fn().mockResolvedValue([stale]), saveRun: jest.fn().mockResolvedValue(undefined) };
    await new MonitorScheduler(store, { run: jest.fn() }).initialize();
    expect(store.saveRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'stale', status: 'failed', errorCode: 'TAB_CLOSED' }));
  });
});
