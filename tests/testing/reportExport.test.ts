import { buildSafeTestReport } from '../../src/testing/reportExport';
import type { TestCaseRun, TestStepResult, TestSuiteRun } from '../../src/testing/types';

describe('safe test report export', () => {
  it('retains statuses and immutable version ids without exporting sensitive observations', () => {
    const run: TestSuiteRun = { id: 'run-1', suiteId: 'suite-1', status: 'completed', concurrency: 2, createdAt: 10, ownerWindowId: 1 };
    const caseRun: TestCaseRun = { id: 'case-run-1', suiteRunId: run.id, suiteId: run.suiteId, caseId: 'case-1', caseVersionId: 'version-2', status: 'failed' };
    const step: TestStepResult = { id: 'step-result-1', caseRunId: caseRun.id, stepId: 'step-1', status: 'failed', expected: 'secret@example.com', actual: 'secret@example.com', url: 'https://example.com/?token=private', errorMessage: 'form field contained private data', screenshot: 'private-evidence', startedAt: 10, endedAt: 20 };
    const report = buildSafeTestReport(run, [{ run: caseRun, steps: [step] }]);
    const exported = JSON.stringify(report);
    expect(report.cases[0].caseVersionId).toBe('version-2');
    expect(report.cases[0].steps[0].status).toBe('failed');
    expect(exported).not.toContain('secret@example.com');
    expect(exported).not.toContain('private');
  });
});
