import { resultSummaryFromStep, runResultLabel, runStatusLabel } from '../../src/workflows/runPresentation';
import type { WorkflowRun, WorkflowStepRun } from '../../src/workflows/types';

const run = (patch: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: 'r1', workflowId: 'w1', versionId: 'v1', status: 'succeeded', startedAt: 1,
  llmCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0, ...patch,
});

it('stores only extraction counts and completeness, never row content', () => {
  const step = { extractionResult: { rows: [{ password: 'secret' }, { token: 'private' }], partial: true } } as WorkflowStepRun;
  expect(resultSummaryFromStep(step)).toEqual({ kind: 'extraction', count: 2, partial: true });
  expect(JSON.stringify(resultSummaryFromStep(step))).not.toMatch(/secret|private/);
});

it('distinguishes completion from verification and handles legacy runs', () => {
  expect(runStatusLabel(run())).toBe('Finished · unverified');
  expect(runStatusLabel(run({ verification: 'verified' }))).toBe('Verified');
  expect(runResultLabel(run())).toBeUndefined();
  expect(runResultLabel(run({ resultSummary: { kind: 'office', count: 4 } }))).toBe('4 records found');
  expect(runResultLabel(run({ status: 'failed', resultSummary: { kind: 'office', count: 4 } }))).toBeUndefined();
});
