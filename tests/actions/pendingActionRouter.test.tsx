import React from 'react';
import { render } from '@testing-library/react';
import { PendingActionRouter } from '../../src/sidepanel/components/actions/PendingActionRouter';

describe('PendingActionRouter', () => {
  it('consumes a pending invocation', () => {
    const onAction = jest.fn();
    (globalThis as any).chrome = {
      runtime: { sendMessage: jest.fn((_msg, cb) => cb({ invocation: { actionId: 'summarize' } })) },
      storage: { onChanged: { addListener: jest.fn(), removeListener: jest.fn() } },
    };
    render(<PendingActionRouter tabId={2} windowId={1} onAction={onAction} />);
    expect(onAction).toHaveBeenCalledWith({ actionId: 'summarize' });
  });

  it('consumes an action saved after the panel opens', () => {
    const onAction = jest.fn();
    let onChanged: (changes: Record<string, { newValue?: unknown }>) => void = () => {};
    const sendMessage = jest.fn((_msg, cb) => cb(sendMessage.mock.calls.length === 1 ? {} : { invocation: { actionId: 'translate', selectionText: 'hello' } }));
    (globalThis as any).chrome = {
      runtime: { sendMessage },
      storage: { onChanged: { addListener: jest.fn(listener => { onChanged = listener; }), removeListener: jest.fn() } },
    };
    render(<PendingActionRouter tabId={2} windowId={1} onAction={onAction} />);
    onChanged({ 'pendingAction:1:2': { newValue: { actionId: 'translate' } } });
    expect(onAction).toHaveBeenCalledWith({ actionId: 'translate', selectionText: 'hello' });
  });
});
