import { trimNativeHistory } from '../../../src/agent/TokenManager';
it('keeps the current request and complete native invocation/result pairs', () => {
  const messages = [{ role: 'user', content: 'Summarize EasyRL' }];
  for (let i = 0; i < 30; i++) messages.push(...[
    { role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'read', arguments: '{"input":"","requires_approval":false}' } }] },
    { role: 'tool', tool_call_id: `c${i}`, content: 'Page content '.repeat(200) },
  ] as any);
  const trimmed = trimNativeHistory(messages, 1000);
  expect(trimmed.length).toBeLessThan(messages.length);
  expect(trimmed[0]).toEqual(messages[0]);
  expect(trimmed.slice(-2)).toEqual(messages.slice(-2));
  for (let i = 1; i < trimmed.length; i++) {
    if (trimmed[i].role === 'tool') expect(trimmed[i - 1].tool_calls[0].id).toBe(trimmed[i].tool_call_id);
    if (trimmed[i].tool_calls) expect(trimmed[i + 1].tool_call_id).toBe(trimmed[i].tool_calls[0].id);
  }
});
it('never keeps an orphan native result', () => {
  const result = trimNativeHistory([{ role: 'user', content: 'Current task' }, { role: 'tool', tool_call_id: 'lost', content: 'x'.repeat(50000) }], 100);
  expect(result).toEqual([{ role: 'user', content: 'Current task' }]);
});
it('does not retain oversized content when the token budget is very small', () => {
  const result = trimNativeHistory([{ role: 'user', content: 'a'.repeat(10000) }, { role: 'assistant', content: 'b'.repeat(10000) }], 30);
  expect(JSON.stringify(result).length).toBeLessThan(150);
});
