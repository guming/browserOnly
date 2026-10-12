import { consumePendingAction, putPendingAction } from '../../src/actions/pendingActionStore';

describe('pendingActionStore', () => {
  it('isolates invocations by window and tab and consumes once', async () => {
    const values: Record<string, unknown> = {};
    (globalThis as any).chrome = { storage: { session: { set: jest.fn(async (next: Record<string, unknown>) => Object.assign(values, next)), get: jest.fn(async (key: string) => ({ [key]: values[key] })), remove: jest.fn(async (key: string) => { delete values[key]; }) } } };
    const invocation = { actionId: 'summarize', source: 'context_menu' as const, tabId: 2, windowId: 1 };
    await putPendingAction(invocation);
    expect(await consumePendingAction(2, 1)).toBeUndefined();
    expect(await consumePendingAction(1, 2)).toEqual(invocation);
    expect(await consumePendingAction(1, 2)).toBeUndefined();
  });
});
