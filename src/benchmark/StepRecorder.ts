import type { ToolTraceEvent } from '../workflows/types';

export interface StepTiming {
  sequence: number; executionId: string; toolName: string; startedAt: string;
  endedAt?: string; durationMs?: number; status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
  errorCode?: string;
}
export class StepRecorder {
  readonly steps: StepTiming[] = [];
  start(event: ToolTraceEvent): void {
    if (this.steps.some(step => step.executionId === event.executionId && step.status === 'running')) return;
    this.steps.push({ sequence: this.steps.length + 1, executionId: event.executionId, toolName: event.toolName,
      startedAt: new Date(event.startedAt).toISOString(), status: 'running' });
  }
  finish(event: ToolTraceEvent): void {
    if (!event.executed) return;
    const step = [...this.steps].reverse().find(item => item.executionId === event.executionId && item.status === 'running');
    if (!step) return;
    Object.assign(step, { endedAt: new Date(event.endedAt!).toISOString(), durationMs: event.durationMs,
      status: event.result?.ok ? 'succeeded' : 'failed', errorCode: event.result?.error?.code });
  }
  interrupt(cancelled: boolean): void {
    for (const step of this.steps) if (step.status === 'running') step.status = cancelled ? 'cancelled' : 'interrupted';
  }
}
