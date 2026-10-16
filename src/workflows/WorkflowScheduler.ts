import { WorkflowStore } from './WorkflowStore';
import type { Workflow, WorkflowRun, WorkflowSchedule } from './types';

export const WORKFLOW_ALARM = 'browseronly-workflow-tick';
export function nextScheduledRun(schedule: Pick<WorkflowSchedule, 'frequency' | 'time' | 'weekday'>, after = Date.now()): number {
  if (schedule.frequency === 'hourly') return after + 60 * 60_000;
  const [hour, minute] = schedule.time.split(':').map(Number);
  const next = new Date(after);
  next.setHours(hour, minute, 0, 0);
  if (schedule.frequency === 'weekly') next.setDate(next.getDate() + (schedule.weekday - next.getDay() + 7) % 7);
  if (next.getTime() <= after) next.setDate(next.getDate() + (schedule.frequency === 'weekly' ? 7 : 1));
  return next.getTime();
}

export class WorkflowScheduler {
  private busy = false;
  constructor(private readonly execute: (workflow: Workflow) => Promise<WorkflowRun | undefined>, private readonly store = WorkflowStore.getInstance()) {}
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const item of await this.store.listWorkflows()) {
        const workflow = await this.store.getWorkflow(item.id);
        const schedule = workflow?.schedule;
        if (!workflow || workflow.status !== 'active' || schedule?.status !== 'active' || !schedule.nextRunAt || schedule.nextRunAt > Date.now()) continue;
        const now = Date.now();
        const updated: WorkflowSchedule = { ...schedule, nextRunAt: nextScheduledRun(schedule, now), lastRunAt: now,
          missedRuns: schedule.nextRunAt < now - 60_000 ? (schedule.missedRuns ?? 0) + 1 : schedule.missedRuns };
        // Advance before dispatch: missed executions are merged into one, never replayed in a burst.
        await this.store.saveWorkflow({ ...workflow, schedule: updated });
        try {
          const run = await this.execute(workflow);
          if (!run || run.status !== 'succeeded') throw new Error(run?.failureMessage || `Execution ${run?.status ?? 'interrupted'}`);
        } catch (error) {
          const current = await this.store.getWorkflow(workflow.id);
          if (!current?.schedule || current.schedule.status !== 'active') continue;
          const message = error instanceof Error ? error.message : String(error);
          if (/already running/.test(message)) {
            await this.store.saveWorkflow({ ...current, schedule: { ...current.schedule, nextRunAt: Date.now() + 60_000, lastError: 'Waiting for the current task to finish.' } });
            continue;
          }
          await this.store.saveWorkflow({ ...current, schedule: { ...current.schedule, status: 'needs_attention', nextRunAt: undefined, lastError: message } });
          await Promise.resolve(chrome.notifications.create(`workflow:${workflow.id}`, { type: 'basic', iconUrl: 'icons/icon128.png', title: workflow.name, message: message.includes('APPROVAL_REQUIRED') ? 'Approval needed. Open Automations and run this task manually.' : `Schedule paused: ${message.slice(0, 180)}` })).catch(() => undefined);
        }
      }
    } finally { this.busy = false; }
  }
}
