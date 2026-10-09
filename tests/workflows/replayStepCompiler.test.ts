import { compileTrace } from '../../src/workflows/WorkflowCompiler';
const event = (toolName: string, input = '', ok = true) => ({ executionId: toolName, toolName, input, startedAt: 1, result: { ok } });
test('keeps repeated writes and required reads, drops preparation and failed attempts', () => {
  const prompt = '完整指令'.repeat(50);
  const { version, workflow } = compileTrace([event('lookup_memories'), event('browser_navigate', 'https://www.jd.com/'), event('browser_click', '#cart'), event('browser_click', '#cart'), event('browser_click', '#failed', false), event('browser_read_text'), event('browser_screenshot')], 'clawhub.ai', 'JD', 'https://clawhub.ai/dashboard', prompt);
  expect(version.taskInstruction).toBe(prompt);
  expect(version.replayFormat).toBe('steps-v2');
  expect(version.steps.map(step => step.toolName)).toEqual(['browser_navigate', 'browser_click', 'browser_click', 'browser_read_text']);
  expect(workflow.startUrl).toBe('https://www.jd.com/');
  expect(version.steps[0].input).toBe('https://www.jd.com/');
});
test('missing opt-in preserves legacy compilation', () => {
  expect(compileTrace([event('browser_click', '#cart')], 'source.test', 'Old', 'https://source.test/').version).toMatchObject({ replayFormat: undefined, steps: [expect.objectContaining({ toolName: 'browser_navigate' }), expect.objectContaining({ toolName: 'browser_click' })] });
});
