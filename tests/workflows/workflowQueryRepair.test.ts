import { WorkflowRunner } from '../../src/workflows/WorkflowRunner';
import type { WorkflowVersion } from '../../src/workflows/types';
import { proposeQuerySelector } from '../../src/workflows/WorkflowQueryRepair';

jest.mock('../../src/workflows/WorkflowStore', () => ({
  WorkflowStore: { getInstance: () => ({ saveRun: jest.fn(), saveStepRun: jest.fn() }) },
}));

const version: WorkflowVersion = {
  id: 'v1', workflowId: 'w1', version: 1, source: 'recording', createdAt: 1,
  finalAssertions: [], steps: [{
    id: 's1', type: 'action', label: 'find product list', enabled: true,
    toolName: 'browser_query', input: 'div[id="J_goodsList"]', timeoutMs: 1000,
    retryPolicy: { maxAttempts: 1, delayMs: 0 }, onFailure: 'repair', risk: 'read',
  }],
};

describe('workflow query repair', () => {
  it('rejects a broad model selector even when it is valid CSS', async () => {
    const provider = {
      createMessage: async function* () { yield { type: 'text', text: '{"selector":"body","evidenceText":"肽敏舒"}' }; },
    } as any;
    const page = { url: () => 'https://example.com', locator: () => ({ evaluate: async () => '<body>肽敏舒</body>' }) };
    expect(await proposeQuerySelector(provider, version.steps[0], '#missing', page)).toBeUndefined();
  });

  it('validates the proposed selector using the tool before continuing', async () => {
    const query = jest.fn(async (selector: string) => selector === '.goods-list'
      ? '<div class="goods-list">肽敏舒</div>' : 'Error: No nodes matched selector');
    const repairQuery = jest.fn(async () => '.goods-list');
    const run = await new WorkflowRunner().run('w1', version, {
      tools: [{ name: 'browser_query', description: '', func: query }], repairQuery,
    });
    expect(run.status).toBe('succeeded');
    expect(repairQuery).toHaveBeenCalledWith(version.steps[0], version.steps[0].input);
    expect(query).toHaveBeenCalledWith('.goods-list');
  });

  it('fails safely when the proposed selector also matches nothing', async () => {
    const run = await new WorkflowRunner().run('w1', version, {
      tools: [{ name: 'browser_query', description: '', func: async () => 'Error: No nodes matched selector' }],
      repairQuery: async () => '.wrong',
    });
    expect(run.status).toBe('failed');
  });

  it('repairs a failed click using the proposed target', async () => {
    const click = jest.fn(async (input: string) => input === '.target' ? 'Clicked selector' : 'Error clicking');
    const run = await new WorkflowRunner().run('w1', {
      ...version, steps: [{ ...version.steps[0], toolName: 'browser_click', input: '.old', risk: 'write' }],
    }, {
      tools: [{ name: 'browser_click', description: '', func: click }],
      repairQuery: async () => '.target',
    });
    expect(run.status).toBe('succeeded');
    expect(click).toHaveBeenCalledWith('.target');
  });

  it('retries reads but never blindly retries writes', async () => {
    const query = jest.fn().mockResolvedValueOnce('Error: missing').mockResolvedValueOnce('<div>found</div>');
    const retryVersion = { ...version, steps: [{ ...version.steps[0], onFailure: 'stop' as const, retryPolicy: { maxAttempts: 2, delayMs: 0 } }] };
    expect((await new WorkflowRunner().run('w1', retryVersion, {
      tools: [{ name: 'browser_query', description: '', func: query }],
    })).status).toBe('succeeded');
    expect(query).toHaveBeenCalledTimes(2);

    const click = jest.fn(async () => 'Error clicking');
    expect((await new WorkflowRunner().run('w1', {
      ...retryVersion, steps: [{ ...retryVersion.steps[0], toolName: 'browser_click', risk: 'write' }],
    }, { tools: [{ name: 'browser_click', description: '', func: click }] })).status).toBe('failed');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('stops when a precondition cannot be evaluated', async () => {
    const query = jest.fn(async () => '<div>found</div>');
    const run = await new WorkflowRunner().run('w1', {
      ...version, steps: [{ ...version.steps[0], preconditions: [{ type: 'row_count', expected: 1, timeoutMs: 100 }] }],
    }, { tools: [{ name: 'browser_query', description: '', func: query }] });
    expect(run.status).toBe('failed');
    expect(query).not.toHaveBeenCalled();
  });

  it('does not treat a query error as proof that an element is absent', async () => {
    const run = await new WorkflowRunner().run('w1', {
      ...version,
      steps: [{ ...version.steps[0], postconditions: [{
        type: 'element_absent', expected: true, locator: { css: '#missing', fallbackOrder: ['css'] }, timeoutMs: 100,
      }] }],
    }, { tools: [{ name: 'browser_query', description: '', func: async () => 'Error: page unavailable' }] });
    expect(run.status).toBe('failed');
  });
});
