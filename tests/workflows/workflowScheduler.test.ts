import { WorkflowScheduler, nextScheduledRun } from '../../src/workflows/WorkflowScheduler';
const make = () => {
 let workflow: any = { id: 'w', status: 'active', schedule: { frequency: 'hourly', time: '08:00', weekday: 1, status: 'active', nextRunAt: Date.now() - 4 * 3600000 } };
 const store = { listWorkflows: jest.fn(async () => [workflow]), getWorkflow: jest.fn(async () => workflow), saveWorkflow: jest.fn(async (next:any) => { workflow = next; }) };
 const execute = jest.fn(async () => ({ status: 'succeeded' } as any));
 (chrome.notifications as any) = { create: jest.fn(async () => {}) };
 return { store, execute, scheduler: new WorkflowScheduler(execute, store as any), current: () => workflow };
};
test('merges missed runs into one execution and advances the next run before dispatch', async () => {
 const { scheduler, execute, current } = make();
 await scheduler.tick(); await scheduler.tick();
 expect(execute).toHaveBeenCalledTimes(1);
 expect(current().schedule.nextRunAt).toBeGreaterThan(Date.now());
 expect(current().schedule.missedRuns).toBe(1);
});
test('approval pauses scheduling and notifies instead of waiting unattended', async () => {
 const { scheduler, execute, current } = make();
 execute.mockResolvedValue({ status: 'failed', failureMessage: 'APPROVAL_REQUIRED: Review manually.' } as any);
 await scheduler.tick();
 expect(current().schedule.status).toBe('needs_attention');
 expect(current().schedule.nextRunAt).toBeUndefined();
 expect(chrome.notifications.create).toHaveBeenCalled();
});
test('busy windows defer without disabling the schedule', async () => {
 const { scheduler, execute, current } = make(); execute.mockRejectedValue(new Error('A task is already running in this window.'));
 await scheduler.tick(); expect(current().schedule.status).toBe('active'); expect(current().schedule.nextRunAt).toBeGreaterThan(Date.now());
});
test('paused schedules do not execute', async () => {
 const { scheduler, execute, current } = make(); current().schedule.status = 'paused'; await scheduler.tick(); expect(execute).not.toHaveBeenCalled();
});
test('daily and weekly schedules choose the next local wall-clock occurrence', () => {
 const after = new Date(2026, 9, 15, 9, 0).getTime();
 expect(new Date(nextScheduledRun({ frequency:'daily', time:'08:00', weekday:1 }, after))).toEqual(new Date(2026, 9, 16, 8, 0));
 const weekly = new Date(nextScheduledRun({ frequency:'weekly', time:'08:00', weekday:1 }, after)); expect(weekly.getDay()).toBe(1); expect(weekly.getHours()).toBe(8); expect(weekly.getTime()).toBeGreaterThan(after);
});
