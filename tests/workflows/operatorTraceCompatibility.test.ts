import { TraceRecorder } from '../../src/workflows/TraceRecorder';
import { shouldOfferRecordedWorkflow } from '../../src/workflows/candidateEligibility';
import { parseFinish } from '../../src/agent/ExecutionOutcome';
it('redacts metadata as well as existing input and result fields', () => {
  const recorder = new TraceRecorder(); recorder.start();
  recorder.record({ executionId: 'one', toolName: 'browser_extract_fields', input: { password: 'secret' }, startedAt: 1, result: { ok: true, data: [{ token: 'secret' }], meta: { token: 'secret', scope: 'current_dom' } } });
  const [event] = recorder.finish();
  expect(event.input).toEqual({ password: '[REDACTED]' });
  expect(event.result?.data).toEqual([{ token: '[REDACTED]' }]);
  expect(event.result?.meta).toEqual({ token: '[REDACTED]', scope: 'current_dom' });
});
it('does not offer blocked runs as successful workflow candidates', () => {
  const outcome = parseFinish('<finish status="blocked">Cannot continue</finish>')!;
  const status = outcome.status === 'blocked' ? 'failed' : outcome.status;
  expect(shouldOfferRecordedWorkflow({ taskMode: 'operator', executionStatus: status, recordedEventCount: 2, isReflectionPrompt: false, isMultiTabAnalysis: false })).toBe(false);
  expect(shouldOfferRecordedWorkflow({ taskMode: 'operator', executionStatus: 'completed', recordedEventCount: 2, isReflectionPrompt: false, isMultiTabAnalysis: false })).toBe(true);
});
