import { DeepSeekProvider } from '../../../../src/models/providers/deepseek';

jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({})) }));

async function runStream(chunks: any[]) {
  const provider = new DeepSeekProvider({ apiKey: 'test', apiModelId: 'deepseek-chat' });
  (provider as any).client = { chat: { completions: { create: jest.fn().mockResolvedValue((async function* () {
    for (const chunk of chunks) yield chunk;
  })()) } } };
  const output = [];
  for await (const chunk of provider.createMessage('Test', [])) output.push(chunk);
  return output;
}

const call = (index: number, args: string, name?: string) => ({ choices: [{ delta: {
  tool_calls: [{ index, function: { arguments: args, ...(name ? { name } : {}) } }],
} }] });

describe('DeepSeek streaming tool calls', () => {
  it('keeps parallel tool arguments separate and emits only the first call for the serial engine', async () => {
    const output = await runStream([
      call(0, '{"input":', 'browser_query'),
      call(1, '{"input":', 'browser_query'),
      call(0, '"span:has-text(\\"京东物流\\")","requires_approval":false}'),
      call(1, '"span:text-is(\\"自营/旗舰\\")","requires_approval":false}'),
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ]);
    expect(output).toEqual([{ type: 'tool_call', toolCall: { id: 'call-0', name: 'browser_query', input: 'span:has-text("京东物流")', requiresApproval: false } }]);
  });

  it('does not reset arguments when a gateway repeats the tool name', async () => {
    const output = await runStream([
      call(0, '{"input":', 'browser_query'),
      call(0, '"span","requires_approval":false}', 'browser_query'),
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ]);
    expect(output).toEqual([{ type: 'tool_call', toolCall: { id: 'call-0', name: 'browser_query', input: 'span', requiresApproval: false } }]);
  });
  it('emits the completed call before a usage-only chunk and preserves approval', async () => {
    const output = await runStream([
      call(0, '{"input":"button","requires_approval":true}', 'browser_click'),
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } },
    ]);
    expect(output).toEqual([
      { type: 'tool_call', toolCall: { id: 'call-0', name: 'browser_click', input: 'button', requiresApproval: true } },
      { type: 'usage', inputTokens: 12, cacheReadTokens: 0, outputTokens: 7 },
    ]);
  });

});

it('uses native function instructions and requires approval instead of mixing XML tool syntax', async () => {
  const provider = new DeepSeekProvider({ apiKey: 'test' });
  const create = jest.fn().mockResolvedValue((async function* () {})());
  (provider as any).client = { chat: { completions: { create } } };
  const prompt = 'Call <tool>lookup_memories</tool>.\n## TOOL-CALL SYNTAX\nFor each tool invocation use XML <tool>tool_name</tool><input>args</input><requires_approval>false</requires_approval>\nNote: platform info\n<finish status="blocked">reason</finish>';
  for await (const _ of provider.createMessage(prompt, [], [{ name: 'browser_read_text_enhanced', description: 'Read' }])) {}
  const request = create.mock.calls[0][0];
  expect(request.messages[0].content).toContain('native function');
  expect(request.messages[0].content).not.toContain('<tool>');
  expect(request.messages[0].content).toContain('<finish status="blocked">');
  expect(request.tools[0].function.parameters.required).toEqual(['input', 'requires_approval']);
});

it('preserves selector punctuation and rejects missing approval rather than guessing', async () => {
  const input = 'span[data-x="</input>"]:has-text("京东物流")';
  const output = await runStream([call(0, JSON.stringify({ input, requires_approval: false }), 'browser_query')]);
  expect(output[0]).toMatchObject({ type: 'tool_call', toolCall: { input, requiresApproval: false } });
  const invalid = await runStream([call(0, '{"input":"button"}', 'browser_click')]);
  expect(invalid).toEqual([{ type: 'text', text: 'Error: Failed to parse tool call. Please try again.' }]);
});
it('propagates provider transport errors instead of presenting them as a final answer', async () => {
  const provider = new DeepSeekProvider({ apiKey: 'test' });
  (provider as any).client = { chat: { completions: { create: jest.fn().mockRejectedValue(new Error('Network unavailable')) } } };
  await expect((async () => { for await (const _ of provider.createMessage('Test', [])) {} })()).rejects.toThrow('Network unavailable');
});

it('forwards assistant reasoning_content exactly alongside native calls and repair text', async () => {
  const provider = new DeepSeekProvider({ apiKey: 'test', thinkingBudgetTokens: 1024 });
  const create = jest.fn().mockResolvedValue((async function* () {})());
  (provider as any).client = { chat: { completions: { create } } };
  const history = [
    { role: 'user', content: 'Read' },
    { role: 'assistant', content: null, reasoning_content: 'fixture thinking data', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read', arguments: '{"input":"","requires_approval":false}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'page text' },
    { role: 'assistant', content: 'Repair needed', reasoning_content: 'fixture repair data' },
    { role: 'user', content: 'Continue' },
  ];
  for await (const _ of provider.createMessage('Test', history, [{ name: 'read', description: '' }])) {}
  expect(create.mock.calls[0][0].messages.slice(1)).toEqual(history);
  expect(create.mock.calls[0][0].thinking).toEqual({ type: 'enabled' });
});
