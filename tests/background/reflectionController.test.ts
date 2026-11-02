jest.mock('../../src/background/agentController', () => ({ executePrompt: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/background/tabManager', () => ({ getTabState: jest.fn(), getWindowForTab: jest.fn(() => 10), getAgentForWindow: jest.fn(() => ({})) }));
jest.mock('../../src/background/utils', () => ({ logWithTimestamp: jest.fn(), handleError: jest.fn(), sendUIMessage: jest.fn() }));
jest.mock('../../src/tracking/memoryService', () => ({ MemoryService: { getInstance: () => ({ init: async () => {}, storeMemory: mockStoreMemory }) } }));
const mockStoreMemory = jest.fn().mockResolvedValue(123);
import { recordReflectionSource, clearReflectionSource, triggerReflection, saveReflectionMemory } from '../../src/background/reflectionController';
import { executePrompt } from '../../src/background/agentController';
import { sendUIMessage } from '../../src/background/utils';
import type { ToolTraceEvent } from '../../src/workflows/types';
const event = (name: string, input: unknown = '', ok = true): ToolTraceEvent => ({ executionId: 'run-one', toolName: name, input, result: { ok }, startedAt: 1 });
beforeEach(() => {
  jest.clearAllMocks(); clearReflectionSource(1);
  (global.chrome.tabs.get as jest.Mock).mockResolvedValue({ url: 'https://github.com/example/repo' });
});
it('makes successful read-only browser tasks available for reflection', async () => {
  recordReflectionSource(1, 'github.com', '总结当前仓库页面', [event('browser_read_main')]);
  await triggerReflection(1);
  expect(executePrompt).toHaveBeenCalledWith(expect.stringContaining('browser_read_main'), 1, true, 'reflection');
  expect((sendUIMessage as jest.Mock).mock.calls.some(call => String(call[1]?.content).includes('No completed'))).toBe(false);
});
it('stores a read task as a pending-review candidate using only its captured trace', async () => {
  recordReflectionSource(1, 'github.com', '总结当前仓库页面', [event('browser_read_main'), event('browser_click', 'old', false)]);
  await saveReflectionMemory('{"taskDescription":"读取并总结仓库页面"}', 'github.com', 1);
  expect(mockStoreMemory).toHaveBeenCalledWith(expect.objectContaining({ domain: 'github.com', toolSequence: ['browser_read_main | '], status: 'needs_review', sourceRunId: 'run-one' }));
});
it('does not fabricate a source from failed steps or memory lookups', async () => {
  recordReflectionSource(1, 'github.com', 'Failed', [event('browser_read_main', '', false), event('lookup_memories', 'jd.com')]);
  await triggerReflection(1);
  expect(executePrompt).not.toHaveBeenCalled();
});
it('preserves structured click arguments instead of converting them to object Object', async () => {
  recordReflectionSource(1, 'github.com', 'Open menu', [event('browser_click', { text: 'Menu', scope: '#header' })]);
  await saveReflectionMemory('{"taskDescription":"Open menu"}', 'github.com', 1);
  expect(mockStoreMemory.mock.calls[0][0].toolSequence).toEqual(['browser_click | {"text":"Menu","scope":"#header"}']);
});
it('reflects the captured task after the tab navigates to another website', async () => {
  recordReflectionSource(1, 'jd.com', 'Shopping', [event('browser_click', 'Search')]);
  await triggerReflection(1);
  expect(executePrompt).toHaveBeenCalledWith(expect.stringContaining('Shopping'), 1, true, 'reflection');
  await saveReflectionMemory('{"taskDescription":"Shopping"}', 'github.com', 1);
  expect(mockStoreMemory).toHaveBeenCalledWith(expect.objectContaining({ domain: 'jd.com', sourceRunId: 'run-one' }));
});
