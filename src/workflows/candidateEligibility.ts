export function shouldOfferRecordedWorkflow(input: {
  taskMode?: 'operator' | 'ask';
  executionStatus?: 'completed' | 'cancelled' | 'failed';
  recordedEventCount: number;
  isReflectionPrompt: boolean;
  isMultiTabAnalysis: boolean;
}): boolean {
  return input.taskMode === 'operator'
    && input.executionStatus === 'completed'
    && input.recordedEventCount > 0
    && !input.isReflectionPrompt
    && !input.isMultiTabAnalysis;
}
