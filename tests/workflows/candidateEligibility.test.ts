import { shouldOfferRecordedWorkflow } from '../../src/workflows/candidateEligibility';

const eligible = { taskMode: 'operator' as const, executionStatus: 'completed' as const, recordedEventCount: 2, isReflectionPrompt: false, isMultiTabAnalysis: false };

it('offers a recorded candidate only after a completed Operator task', () => {
  expect(shouldOfferRecordedWorkflow(eligible)).toBe(true);
  expect(shouldOfferRecordedWorkflow({ ...eligible, taskMode: 'ask' })).toBe(false);
  expect(shouldOfferRecordedWorkflow({ ...eligible, taskMode: undefined })).toBe(false);
  expect(shouldOfferRecordedWorkflow({ ...eligible, executionStatus: 'failed' })).toBe(false);
  expect(shouldOfferRecordedWorkflow({ ...eligible, executionStatus: 'cancelled' })).toBe(false);
  expect(shouldOfferRecordedWorkflow({ ...eligible, recordedEventCount: 0 })).toBe(false);
  expect(shouldOfferRecordedWorkflow({ ...eligible, isReflectionPrompt: true })).toBe(false);
  expect(shouldOfferRecordedWorkflow({ ...eligible, isMultiTabAnalysis: true })).toBe(false);
});
