import React from 'react';
import { act, render } from '@testing-library/react';
import { useChromeMessaging } from '../../../src/sidepanel/hooks/useChromeMessaging';

describe('useChromeMessaging workflow approvals', () => {
  it('preserves runId through the approval request and response', async () => {
    let listener: ((message: any, sender: any, sendResponse: (response: any) => void) => boolean) | undefined;
    const onRequestApproval = jest.fn();
    const sendMessage = chrome.runtime.sendMessage as jest.Mock;
    const addListener = chrome.runtime.onMessage.addListener as jest.Mock;
    addListener.mockImplementation(callback => { listener = callback; });
    sendMessage.mockImplementation((message: any, callback?: (response: any) => void) => {
      if (message.action === 'approvalResponse') callback?.({ success: true });
      return undefined;
    });

    let approveRequest: ((requestId: string, runId?: string) => Promise<boolean>) | undefined;
    function Harness() {
      ({ approveRequest } = useChromeMessaging({
        tabId: 10,
        windowId: 20,
        onUpdateOutput: jest.fn(),
        onUpdateStreamingChunk: jest.fn(),
        onFinalizeStreamingSegment: jest.fn(),
        onStartNewSegment: jest.fn(),
        onStreamingComplete: jest.fn(),
        onUpdateLlmOutput: jest.fn(),
        onRateLimit: jest.fn(),
        onFallbackStarted: jest.fn(),
        onUpdateScreenshot: jest.fn(),
        onProcessingComplete: jest.fn(),
        onRequestApproval,
        setTabTitle: jest.fn(),
      }));
      return null;
    }

    render(<Harness />);
    act(() => {
      listener?.({
        action: 'requestApproval',
        requestId: 'approval-1',
        runId: 'run-1',
        toolName: 'browser_click',
        toolInput: 'input[aria-label="搜索"]',
        reason: 'Workflow step requires approval',
        tabId: 10,
        windowId: 20,
      }, {}, jest.fn());
    });

    expect(onRequestApproval).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'approval-1',
      runId: 'run-1',
    }));

    await expect(approveRequest?.('approval-1', 'run-1')).resolves.toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'approvalResponse',
      requestId: 'approval-1',
      runId: 'run-1',
      approved: true,
    }), expect.any(Function));
  });
});
