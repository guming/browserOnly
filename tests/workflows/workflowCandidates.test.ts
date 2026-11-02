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

it('preserves standalone goals instead of pinning the recording URL', () => {
  const result = compileTrace([], 'source.test', 'Research', 'https://source.test/', 'Find new features', 'standalone');
  expect(result.version).toMatchObject({ runStrategy: 'goal', taskInstruction: 'Find new features', entryContext: { kind: 'standalone' } });
  expect(result.workflow.startUrl).toBeUndefined();
  expect(result.workflow.executionMode).toBe('new_tab');
});
it('preserves current-page tasks for reuse on a different active page', () => {
  const result = compileTrace([], 'source.test', 'Read', 'https://source.test/', 'Read this page', 'current-tab');
  expect(result.version).toMatchObject({ runStrategy: 'steps', entryContext: { kind: 'current_page' } });
  expect(result.workflow.executionMode).toBe('current_tab');
  expect(result.workflow.startUrl).toBeUndefined();
});

it('saves recorded read-only analysis as a goal rather than pretending reads reproduce reasoning', () => {
  const trace = ['browser_read_text', 'browser_extract_fields'].map(toolName => ({ executionId: toolName, toolName, input: '', startedAt: 1, result: { ok: true } }));
  const { version } = compileTrace(trace, 'mail.google.com', '邮件总结', 'https://mail.google.com/mail/u/0/#inbox', '找到最新的5封邮件，总结内容，过滤掉广告和营销类邮件', 'current-tab');
  expect(version.runStrategy).toBe('goal');
  expect(version.taskInstruction).toContain('过滤掉广告');
  expect(version.entryContext).toEqual({ kind: 'current_page' });
});
it('keeps actionable recordings and explicit legacy rules as deterministic replay', () => {
  const trace = [{ executionId: 'click', toolName: 'browser_click', input: 'Menu', startedAt: 1, result: { ok: true } }];
  expect(compileTrace(trace, 'example.com', 'Open menu', 'https://example.com', 'Open menu', 'current-tab').version.runStrategy).toBe('steps');
  const reads = [{ ...trace[0], toolName: 'browser_read_text' }];
  expect(compileTrace(reads, 'example.com').version.runStrategy).toBe('steps');
});

it('keeps navigation as part of a read-only goal instead of dropping the analysis', () => {
  const trace = [
    { executionId: 'nav', toolName: 'browser_navigate', input: 'https://mail.google.com/', startedAt: 1, result: { ok: true } },
    { executionId: 'read', toolName: 'browser_read_text', input: '', startedAt: 2, result: { ok: true } },
  ];
  const result = compileTrace(trace, 'mail.google.com', 'Summarize', 'https://mail.google.com/', 'Summarize the latest messages');
  expect(result.version.runStrategy).toBe('goal');
  expect(result.version.entryContext).toEqual({ kind: 'url', url: 'https://mail.google.com/' });
});
