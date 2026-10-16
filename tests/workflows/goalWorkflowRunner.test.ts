jest.mock('../../src/agent/AgentCore', () => ({ createBrowserAgent: jest.fn() }));
jest.mock('../../src/agent/approvalManager', () => ({ cancelRunApprovals: jest.fn() }));
import { GoalWorkflowRunner } from '../../src/workflows/GoalWorkflowRunner';
import { cancelRunApprovals } from '../../src/agent/approvalManager';
import type { Workflow, WorkflowVersion } from '../../src/workflows/types';

const workflow: Workflow = { id: 'w', name: 'Research', description: '', schemaVersion: 1, status: 'active', triggerDomains: [], variables: [], activeVersionId: 'v', executionMode: 'new_tab', createdAt: 1, updatedAt: 1 };
const version: WorkflowVersion = { id: 'v', workflowId: 'w', version: 1, source: 'recording', runStrategy: 'goal', taskInstruction: 'Find this week’s new features', entryContext: { kind: 'standalone' }, steps: [], finalAssertions: [], createdAt: 1 };
const context = { tabId: 2, ownerTabId: 1, windowId: 3 };
const page = { url: jest.fn(() => 'https://source.test/'), title: jest.fn(async () => 'Source') };
const make = () => {
  const store = { saveRun: jest.fn(async () => {}), saveTraceEvent: jest.fn(async () => {}), saveStepRun: jest.fn(async () => {}) };
  const agent = { cancel: jest.fn(), promptManager: { setCurrentPageContext: jest.fn() }, executePromptWithFallback: jest.fn(async (_prompt, callbacks) => { callbacks.onModelUsage(10, 20); callbacks.onExecutionEnd('completed'); callbacks.onComplete(); }) };
  const createAgent = jest.fn(async () => agent);
  const runner = new GoalWorkflowRunner(store as any, createAgent as any);
  return { store, agent, createAgent, runner };
};

it('explores from the goal with a fresh history and no recorded-page context', async () => {
  const { agent, runner, store } = make();
  const run = await runner.run(workflow, version, page as any, { context, onOutput: jest.fn() });
  expect(agent.executePromptWithFallback).toHaveBeenCalledWith(version.taskInstruction, expect.objectContaining({ executionContext: expect.objectContaining({ ownerTabId: 1, tabId: 2, workflowId: 'w' }) }), [], 'operator');
  expect(agent.promptManager.setCurrentPageContext).not.toHaveBeenCalled();
  expect(run).toMatchObject({ status: 'succeeded', verification: 'unverified', llmCalls: 1, inputTokens: 10, outputTokens: 20 });
  expect(store.saveRun).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'succeeded', endedAt: expect.any(Number) }));
});

it('sets the current webpage context for page-based goal runs', async () => {
  const { agent, runner } = make();
  await runner.run(workflow, { ...version, entryContext: { kind: 'current_page' } }, page as any, { context, onOutput: jest.fn() });
  expect(agent.promptManager.setCurrentPageContext).toHaveBeenCalledWith('https://source.test/', 'Source');
});

it('records a terminal engine failure instead of marking completion as success', async () => {
  const { agent, runner } = make();
  agent.executePromptWithFallback.mockImplementation(async (_prompt, callbacks) => { callbacks.onExecutionEnd('failed', 'Provider unavailable'); callbacks.onComplete(); });
  const run = await runner.run(workflow, version, page as any, { context, onOutput: jest.fn() });
  expect(run).toMatchObject({ status: 'failed', failureMessage: 'Provider unavailable' });
});

it('cancels scoped approvals and skips agent execution if cancelled during setup', async () => {
  const { runner, agent, createAgent } = make();
  createAgent.mockImplementation(async () => { runner.cancel(); return agent; });
  const run = await runner.run(workflow, version, page as any, { context, onOutput: jest.fn() });
  expect(run.status).toBe('cancelled');
  expect(cancelRunApprovals).toHaveBeenCalledWith(run.id);
  expect(agent.executePromptWithFallback).not.toHaveBeenCalled();
});

it('fails before invoking the model when the saved goal is missing', async () => {
  const { runner, createAgent } = make();
  const run = await runner.run(workflow, { ...version, taskInstruction: '' }, page as any, { context, onOutput: jest.fn() });
  expect(run.status).toBe('failed');
  expect(createAgent).not.toHaveBeenCalled();
});

it('substitutes task inputs while leaving saved instructions intact', async () => {
  const { runner, agent } = make();
  const saved = { ...version, taskInstruction: 'Research {{ topic }}' };
  await runner.run(workflow, saved, page as any, { context, variables: { topic: 'browsers' }, onOutput: jest.fn() });
  expect(agent.executePromptWithFallback.mock.calls[0][0]).toBe('Research browsers');
  expect(saved.taskInstruction).toBe('Research {{ topic }}');
});
