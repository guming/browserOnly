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
    expect(output).toEqual([{ type: 'text', text: '<tool>browser_query</tool>\n<input>span:has-text("京东物流")</input>\n<requires_approval>false</requires_approval>' }]);
  });

  it('does not reset arguments when a gateway repeats the tool name', async () => {
    const output = await runStream([
      call(0, '{"input":', 'browser_query'),
      call(0, '"span","requires_approval":false}', 'browser_query'),
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ]);
    expect(output).toEqual([{ type: 'text', text: '<tool>browser_query</tool>\n<input>span</input>\n<requires_approval>false</requires_approval>' }]);
  });
  it('emits the completed call before a usage-only chunk and preserves approval', async () => {
    const output = await runStream([
      call(0, '{"input":"button","requires_approval":true}', 'browser_click'),
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } },
    ]);
    expect(output).toEqual([
      { type: 'text', text: '<tool>browser_click</tool>\n<input>button</input>\n<requires_approval>true</requires_approval>' },
      { type: 'usage', inputTokens: 12, cacheReadTokens: 0, outputTokens: 7 },
    ]);
  });

});
