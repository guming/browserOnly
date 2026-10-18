import type { TestCaseRun, TestStepResult, TestSuiteRun } from './types';

/** Build a portable summary without page URLs, assertions, form values, error text, or screenshots. */
export function buildSafeTestReport(run: TestSuiteRun, cases: Array<{ run: TestCaseRun; steps: TestStepResult[] }>) {
  return {
    format: 'browseronly-test-report-v1',
    suiteId: run.suiteId,
    runId: run.id,
    status: run.status,
    concurrency: run.concurrency,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    cases: cases.map(({ run: item, steps }) => ({
      caseId: item.caseId,
      caseVersionId: item.caseVersionId,
      status: item.status,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      steps: steps.map(step => ({ stepId: step.stepId, status: step.status, startedAt: step.startedAt, endedAt: step.endedAt, errorCode: step.errorCode })),
    })),
  };
}
