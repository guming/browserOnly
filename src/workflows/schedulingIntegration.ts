import { WorkflowScheduler, WORKFLOW_ALARM, nextScheduledRun } from './WorkflowScheduler';
import { WorkflowStore } from './WorkflowStore';
import type { WorkflowSchedule } from './types';
import { handleRunWorkflow } from '../background/messageHandler';

const store = WorkflowStore.getInstance();
const scheduler = new WorkflowScheduler(async workflow => {
  const schedule = workflow.schedule!;
  const tab = await chrome.tabs.get(schedule.ownerTabId);
  if (tab.windowId !== schedule.ownerWindowId) throw new Error('The scheduled task tab moved to another window. Resume the schedule from its intended tab.');
  return handleRunWorkflow({ action: 'runWorkflow', workflowId: workflow.id, versionId: workflow.activeVersionId,
    ownerTabId: tab.id, ownerWindowId: tab.windowId, scheduled: true, variables: Object.fromEntries(workflow.variables.filter(variable => variable.type !== 'secret').map(variable => [variable.key, variable.defaultValue])) });
});

export function setupWorkflowScheduling(): void {
  const initialize = async () => { await chrome.alarms.create(WORKFLOW_ALARM, { periodInMinutes: 1 }); await scheduler.tick(); };
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === WORKFLOW_ALARM) void scheduler.tick().catch(console.error); });
  chrome.runtime.onStartup.addListener(() => void initialize().catch(console.error));
  chrome.runtime.onInstalled.addListener(() => void initialize().catch(console.error));
  void (async () => {
    for (const run of await store.listRuns()) {
      if (run.source !== 'schedule' || run.status !== 'running') continue;
      await store.saveRun({ ...run, status: 'failed', endedAt: Date.now(), failureMessage: 'Scheduled execution was interrupted. Review before resuming.' });
      const workflow = await store.getWorkflow(run.workflowId);
      if (workflow?.schedule?.status === 'active') await store.saveWorkflow({ ...workflow, schedule: { ...workflow.schedule, status: 'needs_attention', nextRunAt: undefined, lastError: 'Scheduled execution was interrupted. Review before resuming.' } });
    }
    await initialize();
  })().catch(console.error);
}

export async function handleWorkflowSchedule(message: any, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (sender.id !== chrome.runtime.id || sender.tab) throw new Error('Schedules must be configured from BrowserOnly.');
  const workflow = await store.getWorkflow(message.workflowId);
  if (!workflow || workflow.status !== 'active') throw new Error('Save this task before scheduling it.');
  if (message.operation === 'pause') {
    if (!workflow.schedule) throw new Error('No schedule configured.');
    await store.saveWorkflow({ ...workflow, schedule: { ...workflow.schedule, status: 'paused', nextRunAt: undefined } });
  } else {
    const input = message.operation === 'resume' ? workflow.schedule : message.schedule;
    if (!input || !['hourly', 'daily', 'weekly'].includes(input.frequency) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) || !Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) throw new Error('Choose a valid frequency and time.');
    const tab = await chrome.tabs.get(message.ownerTabId);
    if (typeof tab.id !== 'number') throw new Error('Open the intended task tab before scheduling.');
    const version = await store.getVersion(workflow.activeVersionId);
    if (!version) throw new Error('Task rules unavailable.');
    if (workflow.variables.some(variable => variable.required && (variable.type === 'secret' || variable.defaultValue === undefined || variable.defaultValue === ''))) throw new Error('Set default values for required inputs before scheduling. Secrets must be supplied during a manual run.');
    const schedule: WorkflowSchedule = { ...input, status: 'active', ownerTabId: tab.id, ownerWindowId: tab.windowId, lastError: undefined, nextRunAt: nextScheduledRun(input) };
    await store.saveWorkflow({ ...workflow, schedule });
  }
  return { success: true, workflow: await store.getWorkflow(workflow.id) };
}
