export type StopReason = 'MODEL_FINAL' | 'MODEL_BLOCKED' | 'PROTOCOL_REPAIR_LIMIT' | 'TOOL_BUDGET' | 'REQUEST_BUDGET' | 'REPEATED_FAILURE' | 'PROTOCOL_ERROR' | 'CANCELLED' | 'EXECUTION_ERROR' | 'EXECUTION_BUSY';
export interface ExecutionOutcome {
  status: 'completed' | 'blocked' | 'failed' | 'cancelled';
  reason: StopReason;
  message?: string;
}
export function parseFinish(text: string): ExecutionOutcome | undefined {
  const match = text.trim().match(/^<finish status="(completed|blocked)">([\s\S]*?)<\/finish>$/);
  if (!match || !match[2].trim()) return undefined;
  return { status: match[1] as 'completed' | 'blocked', reason: match[1] === 'completed' ? 'MODEL_FINAL' : 'MODEL_BLOCKED', message: match[2].trim() };
}
