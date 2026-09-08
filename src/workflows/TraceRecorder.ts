import type { ToolTraceEvent } from './types';

/** Collects one agent execution without coupling the Agent to Workflow storage. */
export class TraceRecorder {
  private events: ToolTraceEvent[] = [];
  private active = false;

  start(): void {
    this.events = [];
    this.active = true;
  }

  record(event: ToolTraceEvent): void {
    if (this.active) this.events.push(this.redact(event));
  }

  finish(): ToolTraceEvent[] {
    this.active = false;
    return [...this.events];
  }

  cancel(): void {
    this.active = false;
    this.events = [];
  }

  private redact(event: ToolTraceEvent): ToolTraceEvent {
    return {
      ...event,
      input: redactValue(event.input),
      result: event.result ? { ...event.result, data: redactValue(event.result.data) } : undefined
    };
  }
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/(password|passwd|secret|token|api[_-]?key|card(number)?|cvv)\s*[:=]\s*[^,;&\s]+/gi, '$1=[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const sensitive = /password|passwd|secret|token|api[_-]?key|card(number)?|cvv/i.test(key);
      return [key, sensitive ? '[REDACTED]' : redactValue(item)];
    }));
  }
  return value;
}
