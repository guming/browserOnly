import 'openai/shims/node';
jest.mock('../../src/agent/tools', () => ({
  getAllTools: jest.fn(() => [
    'browser_get_title', 'browser_read_text', 'browser_read_text_ast',
    'browser_get_overview', 'browser_get_section', 'browser_get_summary',
    'browser_query',
  ].map(name => ({ name, description: name, func: jest.fn() }))),
}));
jest.mock('../../src/agent/tools/memoryTools', () => ({
  lookupMemories: jest.fn(() => ({ name: 'memory_lookup', description: 'memory', func: jest.fn() })),
}));
jest.mock('../../src/background/configManager', () => ({ ConfigManager: { getInstance: jest.fn() } }));
jest.mock('../../src/models/providers/factory', () => ({ createProvider: jest.fn() }));
import { WorkflowService } from '../../src/workflows/WorkflowService';
import type { WorkflowRun, WorkflowVersion } from '../../src/workflows/types';

describe('WorkflowService tool registration', () => {
  it('registers one implementation for each workflow tool', async () => {
    const page = { url: jest.fn(() => 'https://www.jd.com/') } as any;
    const version: WorkflowVersion = {
      id: 'version-1', workflowId: 'workflow-1', version: 1, source: 'recording',
      steps: [], finalAssertions: [], createdAt: Date.now(),
    };
    const run: WorkflowRun = {
      id: 'run-1', workflowId: 'workflow-1', versionId: 'version-1', status: 'failed',
      startedAt: Date.now(), llmCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0,
    };
    const runner = { run: jest.fn().mockResolvedValue(run) } as any;

    await new WorkflowService().run('workflow-1', version, page, { runner });

    const registeredTools = runner.run.mock.calls[0][2].tools as Array<{ name: string }>;
    const names = registeredTools.map(tool => tool.name);
    for (const name of [
      'browser_get_title', 'browser_read_text', 'browser_read_text_ast',
      'browser_get_overview', 'browser_get_section', 'browser_get_summary',
    ]) {
      expect(names.filter(candidate => candidate === name)).toHaveLength(1);
    }
  });
});
