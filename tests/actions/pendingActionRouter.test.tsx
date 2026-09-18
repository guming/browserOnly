import React from 'react';
import { render } from '@testing-library/react';
import { PendingActionRouter } from '../../src/sidepanel/components/actions/PendingActionRouter';
describe('PendingActionRouter', () => { it('consumes a pending invocation', () => { const onAction = jest.fn(); (globalThis as any).chrome = { runtime: { sendMessage: jest.fn((_msg, cb) => cb({ invocation: { actionId: 'summarize' } })) } }; render(<PendingActionRouter tabId={2} windowId={1} onAction={onAction} />); expect(onAction).toHaveBeenCalledWith({ actionId: 'summarize' }); }); });
