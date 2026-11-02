import { executionGroups } from '../../../src/sidepanel/components/executionGroups';
import type { Message } from '../../../src/sidepanel/types';

test('one task keeps steps, approval, screenshot and intermediate replies together', () => {
  const messages: Message[] = [
    { type: 'system', content: 'Execution', runId: 'a', activity: { status: 'completed', steps: [{ executionId: '1', toolName: 'browser_click', status: 'succeeded', durationMs: 20 }] } },
    { type: 'system', content: 'Approval required', runId: 'a' },
    { type: 'screenshot', content: 'Screenshot', runId: 'a' },
    { type: 'llm', content: 'Intermediate', runId: 'a' },
    { type: 'llm', content: 'Final answer', runId: 'a-answer' },
    { type: 'system', content: 'Execution', runId: 'b', activity: { status: 'running', steps: [] } },
  ];
  const groups = executionGroups(messages);
  expect(groups.size).toBe(2);
  expect(groups.get('a')!.messages.map(message => message.content)).toEqual(['Approval required', 'Screenshot', 'Intermediate']);
  expect(groups.get('b')!.messages).toEqual([]);
});
