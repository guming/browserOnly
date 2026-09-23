import { compileTrace, WORKFLOW_CANDIDATE_TTL_MS } from '../../src/workflows/WorkflowCompiler';
import { isExpiredWorkflowCandidate } from '../../src/workflows/WorkflowStore';

describe('recorded workflow candidates', () => {
  it('creates a candidate that expires after one day', () => {
    const { workflow } = compileTrace([], 'example.com', 'Summarize page');

    expect(workflow.status).toBe('candidate');
    expect(workflow.expiresAt).toBe(workflow.createdAt + WORKFLOW_CANDIDATE_TTL_MS);
    expect(isExpiredWorkflowCandidate(workflow, workflow.expiresAt! - 1)).toBe(false);
    expect(isExpiredWorkflowCandidate(workflow, workflow.expiresAt)).toBe(true);
  });

  it('opens the recording tab URL before replaying recorded actions', () => {
    const { workflow, version } = compileTrace([{
      executionId: 'execution-1',
      toolName: 'browser_click',
      input: 'button|Add to cart',
      result: { ok: true },
      startedAt: 1,
      endedAt: 2
    }], 'example.com', 'Add item', 'https://example.com/search?q=books');

    expect(workflow.startUrl).toBe('https://example.com/search?q=books');
    expect(version.steps[0]).toMatchObject({
      type: 'navigate',
      toolName: 'browser_navigate',
      input: 'https://example.com/search?q=books'
    });
  });
});
