import { resolveRecordedEntry } from '../../src/workflows/WorkflowEntryResolver';
const event = (toolName: string, input = '') => ({ executionId: toolName, toolName, input, startedAt: 1, result: { ok: true } });
test('independent navigation ignores recording tab', () => {
  expect(resolveRecordedEntry([event('lookup_memories'), event('browser_navigate', 'https://www.jd.com')], 'https://clawhub.ai/dashboard')).toEqual({ kind: 'url', url: 'https://www.jd.com/' });
});
test('reads before navigation preserve source dependency', () => {
  expect(resolveRecordedEntry([event('browser_read_text'), event('browser_navigate', 'https://www.jd.com')], 'https://source.test/')).toEqual({ kind: 'url', url: 'https://source.test/' });
});
test('unknown context stays on current page', () => expect(resolveRecordedEntry([])).toEqual({ kind: 'current_page' }));

test('explicit page context stays on whichever page is active at replay time', () => {
  expect(resolveRecordedEntry([event('browser_read_text')], 'https://old-source.test/', 'current-tab')).toEqual({ kind: 'current_page' });
});
test('standalone recordings do not pin the first explored URL as their starting point', () => {
  expect(resolveRecordedEntry([event('browser_navigate', 'https://search.test/')], 'https://unrelated.test/', 'standalone')).toEqual({ kind: 'standalone' });
});
