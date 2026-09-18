import { compileTrace, WORKFLOW_CANDIDATE_TTL_MS } from '../../src/workflows/WorkflowCompiler';
import { isExpiredWorkflowCandidate } from '../../src/workflows/WorkflowStore';

describe('recorded workflow candidates', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => '00000000-0000-4000-8000-000000000000')
    });
  });

  it('creates a candidate that expires after one day', () => {
    const { workflow } = compileTrace([], 'example.com', 'Summarize page');

    expect(workflow.status).toBe('candidate');
    expect(workflow.expiresAt).toBe(workflow.createdAt + WORKFLOW_CANDIDATE_TTL_MS);
    expect(isExpiredWorkflowCandidate(workflow, workflow.expiresAt! - 1)).toBe(false);
    expect(isExpiredWorkflowCandidate(workflow, workflow.expiresAt)).toBe(true);
  });
});
