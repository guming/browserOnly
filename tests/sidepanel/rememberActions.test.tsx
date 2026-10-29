import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RememberActions, installRecorder } from '../../src/sidepanel/components/memory/RememberActions';

const storeMemory = jest.fn();
const findSimilarMemory = jest.fn();
jest.mock('../../src/tracking/memoryService', () => ({ MemoryService: { getInstance: () => ({ storeMemory, findSimilarMemory }) } }));
jest.mock('../../src/background/configManager', () => ({ ConfigManager: { getInstance: () => ({ getProviderConfig: async () => ({ provider: 'openai', apiKey: '' }) }) } }));
jest.mock('../../src/models/providers/factory', () => ({ createProvider: async () => ({ createMessage: async function* () { yield { type: 'text', text: 'Export orders' }; } }) }));

describe('RememberActions', () => {
  let receive: (message: any, sender: any) => void;
  let token: string;
  let updated: (id: number, info: any, tab: any) => void;
  let created: (tab: any) => void;
  beforeEach(() => {
    storeMemory.mockReset().mockResolvedValue(1); findSimilarMemory.mockReset().mockResolvedValue(null);
    const event = () => ({ addListener: jest.fn(), removeListener: jest.fn() });
    (globalThis as any).chrome = {
      runtime: { onMessage: { addListener: (listener: typeof receive) => { receive = listener; }, removeListener: jest.fn() } },
      tabs: { get: jest.fn().mockResolvedValue({ url: 'https://example.com/orders' }), onUpdated: { addListener: (fn: typeof updated) => { updated = fn; }, removeListener: jest.fn() }, onCreated: { addListener: (fn: typeof created) => { created = fn; }, removeListener: jest.fn() }, onRemoved: event() },
      scripting: { executeScript: jest.fn(async (options: any) => { if (options.args) token = options.args[0]; }) },
    };
  });
  it('records only messages from the selected tab and saves the reviewed demonstration', async () => {
    render(<RememberActions tabId={2} readable />);
    fireEvent.click(screen.getByText(/Remember my actions/));
    await screen.findByText(/Recording your actions/);
    act(() => {
      receive({ action: 'userMemoryStep', token, step: { kind: 'click', label: 'Export' } }, { tab: { id: 3 } });
      receive({ action: 'userMemoryStep', token, step: { kind: 'click', label: 'Export', element: 'button id=export' } }, { tab: { id: 2 } });
    });
    fireEvent.click(screen.getByText('Done'));
    await screen.findByDisplayValue('Export orders');
    expect(screen.getByText(/1 steps/)).toBeTruthy();
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(storeMemory).toHaveBeenCalledWith(expect.objectContaining({ domain: 'example.com', taskDescription: 'Export orders', toolSequence: ['Click “Export” [element: button id=export]'], status: 'active' })));
  });
  it('continues across websites and into a tab opened by the recorded page', async () => {
    render(<RememberActions tabId={2} readable />);
    fireEvent.click(screen.getByText(/Remember my actions/));
    await screen.findByText(/Recording your actions/);
    act(() => {
      updated(2, { url: 'https://other.example/path?secret=123', status: 'complete' }, { url: 'https://other.example/path?secret=123' });
      created({ id: 4, openerTabId: 2, url: 'https://third.example/', status: 'complete' });
      receive({ action: 'userMemoryStep', token, step: { kind: 'click', label: 'Continue' } }, { tab: { id: 4 } });
    });
    fireEvent.click(screen.getByText('Done'));
    await screen.findByDisplayValue('Export orders');
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(storeMemory).toHaveBeenCalledWith(expect.objectContaining({ domain: 'example.com', toolSequence: ['Open website other.example', 'Open website third.example', 'Click “Continue”'] })));
  });
  it('does not save an empty recording', async () => {
    render(<RememberActions tabId={2} readable />);
    fireEvent.click(screen.getByText(/Remember my actions/));
    await screen.findByText(/Recording your actions/);
    fireEvent.click(screen.getByText('Done'));
    await screen.findByText(/No supported actions/);
    expect(storeMemory).not.toHaveBeenCalled();
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
    expect(steps[0]).toEqual(expect.objectContaining({ kind: 'input', element: 'input type=search name=keyword' }));
    expect(steps[1]).toEqual(expect.objectContaining({ kind: 'click', element: 'a id=product' }));
    expect(JSON.stringify(steps)).not.toContain('私人搜索内容');
    add.mockRestore();
  });
});
