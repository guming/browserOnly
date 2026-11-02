import React from 'react';
import { render, screen, act, renderHook } from '@testing-library/react';
import { MessageDisplay } from '../../../src/sidepanel/components/MessageDisplay';
import { useMessageManagement } from '../../../src/sidepanel/hooks/useMessageManagement';
import type { Message } from '../../../src/sidepanel/types';

jest.mock('../../../src/sidepanel/components/LlmContent', () => ({ LlmContent: ({ content }: any) => <section data-testid="response-card"><p>{content}</p></section> }));
jest.mock('../../../src/sidepanel/components/ScreenshotMessage', () => ({ ScreenshotMessage: () => <p>Screenshot preview</p> }));
jest.mock('../../../src/sidepanel/components/WorkflowChatCard', () => ({ WorkflowChatCard: () => null }));
jest.mock('../../../src/sidepanel/components/WorkflowSaveOfferCard', () => ({ WorkflowSaveOfferCard: () => null }));
jest.mock('react-markdown', () => ({ __esModule: true, default: ({ children }: any) => <div data-testid="progress-markdown">{children}</div> }));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../src/sidepanel/components/MarkdownTable', () => ({ MarkdownTable: () => null }));

test('updates one persisted task card and keeps the final answer outside it', () => {
  const { result } = renderHook(() => useMessageManagement());
  const activity: Message = { type: 'system', content: 'Execution', runId: 'run-a', activity: { status: 'running', steps: [] } };
  act(() => result.current.addMessage(activity));
  act(() => {
    result.current.addSystemMessage('Approval required');
    result.current.addMessage({ type: 'screenshot', content: 'Screenshot', imageData: 'data' });
    result.current.finalizeStreamingSegment(0, 'Intermediate response');
  });
  act(() => result.current.addMessage({ ...activity, activity: { status: 'completed', steps: [
    { executionId: 's1', toolName: 'browser_click', status: 'succeeded', durationMs: 1250 },
    { executionId: 's2', toolName: 'browser_read_text', status: 'succeeded', durationMs: 20 },
  ] } }));
  act(() => result.current.addMessage({ type: 'llm', content: 'Final answer', runId: 'run-a-answer' }));
  expect(result.current.messages.filter(message => message.activity)).toHaveLength(1);
  render(<MessageDisplay messages={result.current.messages} streamingSegments={{}} isStreaming={false} />);
  const summary = screen.getByText('2 steps · completed');
  const card = summary.closest('details')!;
  expect(card).toContainElement(screen.getByText('Approval required'));
  expect(card).toContainElement(screen.getByText('Screenshot preview'));
  expect(card).toContainElement(screen.getByText('Intermediate response'));
  expect(screen.getByTestId('progress-markdown')).toHaveTextContent('Intermediate response');
  expect(card).not.toContainElement(screen.getByText('Final answer'));
  expect(screen.getAllByTestId('response-card')).toHaveLength(1);
  expect(screen.getByText('succeeded · 1.25s')).toBeInTheDocument();
});

test('renders the active stream inside the active task card', () => {
  render(<MessageDisplay messages={[{ type: 'system', content: 'Execution', runId: 'run-a', activity: { status: 'running', steps: [] } }]} streamingSegments={{ 1: 'Live progress' }} isStreaming />);
  const card = screen.getByText('0 steps · running').closest('details')!;
  expect(card).toContainElement(screen.getByText('Live progress'));
});
