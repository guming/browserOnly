import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RememberActions, installRecorder } from '../../src/sidepanel/components/memory/RememberActions';

const saveWorkflow = jest.fn();
const saveVersion = jest.fn();
jest.mock('../../src/workflows/WorkflowStore', () => ({ WorkflowStore: { getInstance: () => ({ saveWorkflow, saveVersion }) } }));
jest.mock('../../src/background/configManager', () => ({ ConfigManager: { getInstance: () => ({ getProviderConfig: async () => ({ provider: 'openai', apiKey: '' }) }) } }));
jest.mock('../../src/models/providers/factory', () => ({ createProvider: async () => ({ createMessage: async function* () { yield { type: 'text', text: 'Export orders' }; } }) }));

describe('RememberActions', () => {
  let receive: (message: any, sender: any) => void;
  let token: string;
  let updated: (id: number, info: any, tab: any) => void;
  let created: (tab: any) => void;
  beforeEach(() => {
    saveWorkflow.mockReset().mockResolvedValue(undefined); saveVersion.mockReset().mockResolvedValue(undefined);
    const event = () => ({ addListener: jest.fn(), removeListener: jest.fn() });
    (globalThis as any).chrome = {
      runtime: { onMessage: { addListener: (listener: typeof receive) => { receive = listener; }, removeListener: jest.fn() } },
      tabs: { get: jest.fn().mockResolvedValue({ url: 'https://example.com/orders' }), onUpdated: { addListener: (fn: typeof updated) => { updated = fn; }, removeListener: jest.fn() }, onCreated: { addListener: (fn: typeof created) => { created = fn; }, removeListener: jest.fn() }, onRemoved: event() },
      scripting: { executeScript: jest.fn(async (options: any) => { if (options.args) token = options.args[0]; }) },
    };
  });
  it('records only messages from the selected tab and saves the reviewed demonstration', async () => {
    render(<RememberActions tabId={2} readable />);
    fireEvent.click(screen.getByText(/Record workflow/));
    await screen.findByText(/Recording your actions/);
    act(() => {
      receive({ action: 'userMemoryStep', token, step: { kind: 'click', label: 'Export', selector: '#export' } }, { tab: { id: 3 } });
      receive({ action: 'userMemoryStep', token, step: { kind: 'click', label: 'Export', selector: '#export' } }, { tab: { id: 2 } });
    });
    fireEvent.click(screen.getByText('Done'));
    await screen.findByDisplayValue('Export orders');
    expect(screen.getByText(/1 steps/)).toBeTruthy();
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(saveWorkflow).toHaveBeenCalledWith(expect.objectContaining({ name: 'Export orders', status: 'draft' })));
    expect(saveVersion).toHaveBeenCalledWith(expect.objectContaining({ steps: [expect.objectContaining({ toolName: 'browser_click', input: '#export' })] }));
  });
  it('continues across websites and into a tab opened by the recorded page', async () => {
    render(<RememberActions tabId={2} readable />);
    fireEvent.click(screen.getByText(/Record workflow/));
    await screen.findByText(/Recording your actions/);
    act(() => {
      updated(2, { url: 'https://other.example/path?secret=123', status: 'complete' }, { url: 'https://other.example/path?secret=123' });
      created({ id: 4, openerTabId: 2, url: 'https://third.example/', status: 'complete' });
      receive({ action: 'userMemoryStep', token, step: { kind: 'click', label: 'Continue', selector: '#continue' } }, { tab: { id: 4 } });
    });
    fireEvent.click(screen.getByText('Done'));
    await screen.findByDisplayValue('Export orders');
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(saveVersion).toHaveBeenCalledWith(expect.objectContaining({ steps: [expect.objectContaining({ toolName: 'browser_navigate', input: 'https://other.example/path' }), expect.objectContaining({ toolName: 'browser_navigate', input: 'https://third.example/' }), expect.objectContaining({ toolName: 'browser_click', input: '#continue' })] })));
  });
  it('does not save an empty recording', async () => {
    render(<RememberActions tabId={2} readable />);
    fireEvent.click(screen.getByText(/Record workflow/));
    await screen.findByText(/Recording your actions/);
    fireEvent.click(screen.getByText('Done'));
    await screen.findByText(/No supported actions/);
    expect(saveWorkflow).not.toHaveBeenCalled();
  });
  it('keeps repeated clicks and turns field input into a workflow variable', async () => {
    render(<RememberActions tabId={2} readable />);
    fireEvent.click(screen.getByText(/Record workflow/));
    await screen.findByText(/Recording your actions/);
    act(() => {
      receive({ action: 'userMemoryStep', token, step: { kind: 'click', label: 'Next', selector: '#next' } }, { tab: { id: 2 } });
      receive({ action: 'userMemoryStep', token, step: { kind: 'click', label: 'Next', selector: '#next' } }, { tab: { id: 2 } });
      receive({ action: 'userMemoryStep', token, step: { kind: 'input', label: 'Search field', selector: 'input[name="q"]' } }, { tab: { id: 2 } });
    });
    fireEvent.click(screen.getByText('Done'));
    await screen.findByDisplayValue('Export orders');
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(saveVersion).toHaveBeenCalled());
    const version = saveVersion.mock.calls[0][0];
    expect(version.steps.map((step: any) => step.toolName)).toEqual(['browser_click', 'browser_click', 'browser_type']);
    expect(version.steps[2].input).toBe('input[name="q"]|{{input_3}}');
    expect(saveWorkflow.mock.calls[0][0].variables).toEqual([expect.objectContaining({ key: 'input_3', required: true })]);
  });
});


describe('page action capture', () => {
  it('captures search input and a long product link without storing input values', () => {
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    (globalThis as any).chrome = { runtime: { sendMessage } };
    document.body.innerHTML = '<input type="search" name="keyword"><a id="product">' + '商品介绍'.repeat(25) + '</a>';
    const handlers: Record<string, EventListener> = {};
    const add = jest.spyOn(document, 'addEventListener').mockImplementation(((type: string, handler: EventListener) => { handlers[type] = handler; }) as typeof document.addEventListener);
    installRecorder('test-token');
    const search = document.querySelector('input')!;
    search.value = '私人搜索内容';
    handlers.input?.({ isTrusted: true, target: search } as unknown as Event);
    handlers.click?.({ isTrusted: true, target: document.querySelector('#product') } as unknown as Event);
    const steps = sendMessage.mock.calls.map(call => call[0].step);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual(expect.objectContaining({ kind: 'input', selector: 'input[name="keyword"]' }));
    expect(steps[1]).toEqual(expect.objectContaining({ kind: 'click', selector: '#product' }));
    expect(JSON.stringify(steps)).not.toContain('私人搜索内容');
    add.mockRestore();
  });
});
