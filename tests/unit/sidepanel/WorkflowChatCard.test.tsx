import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowChatCard } from '../../../src/sidepanel/components/WorkflowChatCard';
import { WorkflowStore } from '../../../src/workflows/WorkflowStore';

jest.mock('../../../src/workflows/WorkflowStore', () => ({ WorkflowStore: { getInstance: jest.fn() } }));
const workflow = { id: 'w1', name: 'Weekly sales tracker', status: 'candidate', activeVersionId: 'v1', variables: [], triggerDomains: ['example.com'], startUrl: 'https://example.com/orders', executionMode: 'new_tab', expiresAt: Date.now() + 86400000 };
const version = { id: 'v1', version: 1, steps: [{ id: 's1', enabled: true, toolName: 'browser_query', label: 'Extract orders' }] };
let store: { getWorkflow: jest.Mock; getVersion: jest.Mock; listRuns: jest.Mock; saveWorkflow: jest.Mock; activateVersion: jest.Mock };
beforeEach(() => {
  store = { getWorkflow: jest.fn().mockResolvedValue(workflow), getVersion: jest.fn().mockResolvedValue(version), listRuns: jest.fn().mockResolvedValue([]), saveWorkflow: jest.fn().mockResolvedValue(undefined), activateVersion: jest.fn().mockResolvedValue(undefined) };
  (WorkflowStore.getInstance as jest.Mock).mockReturnValue(store);
});

it('reviews and saves a candidate with its name and entry point', async () => {
  render(<WorkflowChatCard workflowId="w1" fallbackName={workflow.name} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save as workflow' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Workflow name' }), { target: { value: 'Orders today' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
  await screen.findByRole('button', { name: 'Run now' });
  expect(store.activateVersion).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1', name: 'Orders today', status: 'active', expiresAt: undefined }), expect.any(Object));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByText('Extract orders')).toBeInTheDocument();
});

it('does not revive an expired candidate when Save is clicked', async () => {
  render(<WorkflowChatCard workflowId="w1" fallbackName={workflow.name} />);
  const save = await screen.findByRole('button', { name: 'Save as workflow' });
  store.getWorkflow.mockResolvedValue(undefined);
  fireEvent.click(save);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
  await screen.findByRole('alert');
  expect(store.activateVersion).not.toHaveBeenCalled();
});

it('rejects a candidate with no executable rules', async () => {
  store.getVersion.mockResolvedValue({ ...version, steps: [] });
  render(<WorkflowChatCard workflowId="w1" fallbackName={workflow.name} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save as workflow' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('no executable rules');
  expect(store.activateVersion).not.toHaveBeenCalled();
});

it('loads the current version and recent run results by workflow ID', async () => {
  store.getWorkflow.mockResolvedValue({ ...workflow, status: 'active' });
  store.listRuns.mockResolvedValue([{ id: 'r1', status: 'succeeded', startedAt: Date.now() }]);
  const open = jest.fn();
  render(<WorkflowChatCard workflowId="w1" fallbackName="Old title" onOpenWorkflow={open} />);
  await screen.findByText('Finished · unverified');
  expect(screen.getByRole('heading')).toHaveTextContent(workflow.name);
  expect(screen.getByText('Manual run')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /View task/ }));
  expect(open).toHaveBeenCalledWith('w1');
  await waitFor(() => expect(store.getVersion).toHaveBeenCalledWith('v1'));
});

it('runs the latest saved version in the active browser context', async () => {
  store.getWorkflow.mockResolvedValue({ ...workflow, status: 'active' });
  const query = jest.spyOn(chrome.tabs, 'query').mockResolvedValue([{ id: 42, windowId: 7 }] as chrome.tabs.Tab[]);
  const send = jest.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({ success: true });
  render(<WorkflowChatCard workflowId="w1" fallbackName={workflow.name} />);
  const run = await screen.findByRole('button', { name: 'Run now' });
  store.getWorkflow.mockResolvedValue({ ...workflow, status: 'active', activeVersionId: 'v2' });
  fireEvent.click(run);
  await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ action: 'runWorkflow', versionId: 'v2', ownerTabId: 42, ownerWindowId: 7 })));
  query.mockRestore(); send.mockRestore();
});

it('offers input setup for parameterized tasks instead of claiming to run immediately', async () => {
  store.getWorkflow.mockResolvedValue({ ...workflow, status: 'active', variables: [{ key: 'query', required: true }] });
  const open = jest.fn();
  render(<WorkflowChatCard workflowId="w1" fallbackName={workflow.name} onOpenWorkflow={open} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Set inputs & run' }));
  await waitFor(() => expect(open).toHaveBeenCalledWith('w1', 'run'));
  expect(screen.queryByRole('button', { name: 'Run now' })).not.toBeInTheDocument();
});

it('shows readable recorded rules and preserves custom rule names', async () => {
  store.getVersion.mockResolvedValue({ steps: [
    { id: '1', enabled: true, toolName: 'browser_click', label: 'click', locator: { text: 'Orders' } },
    { id: '2', enabled: true, toolName: 'browser_read_main_for_workflow', label: 'read main for workflow' },
    { id: '3', enabled: true, toolName: 'browser_query', label: 'Extract completed orders' },
  ] });
  render(<WorkflowChatCard workflowId="w1" fallbackName={workflow.name} />);
  await screen.findByText('Click “Orders”');
  expect(screen.getByText('Read the main page content')).toBeInTheDocument();
  expect(screen.getByText('Extract completed orders')).toBeInTheDocument();
});

it('changes execution method in place without promoting a draft to a saved task', async () => {
  store.getVersion.mockResolvedValue({ ...version, taskInstruction: 'Find this week’s sales', runStrategy: 'steps', entryContext: { kind: 'url', url: workflow.startUrl } });
  render(<WorkflowChatCard workflowId="w1" fallbackName={workflow.name} />);
  fireEvent.change(await screen.findByRole('combobox', { name: 'Execution method' }), { target: { value: 'goal' } });
  await waitFor(() => expect(store.activateVersion).toHaveBeenCalledWith(expect.objectContaining({ status: 'candidate' }), expect.objectContaining({ runStrategy: 'goal', taskInstruction: 'Find this week’s sales' })));
  await screen.findByText('Plans new steps each run.');
});

it('allows saving goal tasks without pre-recorded steps', async () => {
  store.getVersion.mockResolvedValue({ ...version, steps: [], taskInstruction: 'Find new features', runStrategy: 'goal', entryContext: { kind: 'standalone' } });
  render(<WorkflowChatCard workflowId="w1" fallbackName={workflow.name} />);
  expect(await screen.findByRole('button', { name: 'Save as workflow' })).toBeEnabled();
  expect(screen.getByText('Independent task')).toBeInTheDocument();
  expect(screen.queryByText('No executable rules. Review this task in Automations.')).not.toBeInTheDocument();
});

it('uses goal exploration when starting independently rather than replaying page-dependent rules on a blank tab', async () => {
  store.getVersion.mockResolvedValue({ ...version, taskInstruction: 'Research new features', entryContext: { kind: 'current_page' } });
  render(<WorkflowChatCard workflowId="w1" fallbackName={workflow.name} />);
  fireEvent.change(await screen.findByRole('combobox', { name: 'Task starting point' }), { target: { value: 'standalone' } });
  await waitFor(() => expect(store.activateVersion).toHaveBeenCalledWith(expect.objectContaining({ executionMode: 'new_tab' }), expect.objectContaining({ runStrategy: 'goal', entryContext: { kind: 'standalone' } })));
});
