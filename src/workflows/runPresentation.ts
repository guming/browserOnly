import type { WorkflowRun, WorkflowStepRun } from './types';

/** Only persist counts and completeness flags from known result types. */
export function resultSummaryFromStep(step: WorkflowStepRun): WorkflowRun['resultSummary'] {
  if (step.extractionResult) return {
    kind: 'extraction', count: step.extractionResult.rows.length,
    partial: !!step.extractionResult.partial,
  };
  if (step.officeReport) return {
    kind: 'office', count: step.officeReport.rows.length,
    partial: !step.officeReport.complete,
  };
  return undefined;
}

export function runStatusLabel(run: WorkflowRun): string {
  if (run.status === 'succeeded') return run.verification === 'verified' ? 'Verified' : 'Finished · unverified';
  return { running: 'Running', repairing: 'Repairing', failed: 'Failed', cancelled: 'Cancelled' }[run.status];
}

export function runResultLabel(run: WorkflowRun): string | undefined {
  const result = run.resultSummary;
  if (!result || run.status !== 'succeeded') return undefined;
  const label = result.kind === 'extraction' ? 'rows extracted' : 'records found';
  return `${result.count} ${label}${result.partial ? ' · partial' : ''}`;
}
