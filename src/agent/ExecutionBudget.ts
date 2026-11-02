import type { StopReason } from './ExecutionOutcome';
import type { ToolResult } from './ToolResult';

export class ExecutionBudget {
  requests = 0;
  calls = 0;
  private repairs = 0;
  private observationStreak = 0;
  private denied = new Set<string>();
  private failures = new Map<string, number>();
  private consecutive?: { tool: string; code: string; count: number };
  constructor(private limits = { requests: 80, calls: 50, repairs: 3 }) {}
  request(): StopReason | undefined {
    if (this.requests >= this.limits.requests) return 'REQUEST_BUDGET';
    this.requests++;
  }
  repair(): StopReason | undefined {
    if (this.repairs >= this.limits.repairs) return 'PROTOCOL_REPAIR_LIMIT';
    this.repairs++;
  }
  parsed(): void { this.repairs = 0; }
  private key(tool: string, input: string, code: string): string { return JSON.stringify([tool, input.trim(), code]); }
  beforeCall(tool: string, input: string): StopReason | undefined {
    if (this.denied.has(JSON.stringify([tool, input.trim()]))) return 'REPEATED_FAILURE';
    if (this.calls >= this.limits.calls) return 'TOOL_BUDGET';
    for (const [key, count] of this.failures) {
      const [failedTool, failedInput] = JSON.parse(key);
      if (failedTool === tool && failedInput === input.trim() && count >= 2) return 'REPEATED_FAILURE';
    }
    if (this.consecutive?.tool === tool && (this.consecutive.count >= 5 ||
      (this.failures.get(this.key(tool, input, this.consecutive.code)) ?? 0) >= 2)) return 'REPEATED_FAILURE';
  }
  called(): void { this.calls++; }
  guidance(): string {
    const remaining = this.limits.calls - this.calls;
    return remaining <= 10
      ? `Tool budget: ${remaining} calls remain. Reuse observations. Verify the outstanding task condition with one focused read instead of exploring more selector variants. Finish the requested result if verified; otherwise report partial results and the precise blocker using a blocked finish declaration. Do not claim success just because a click returned successfully.`
      : '';
  }
  record(tool: string, input: string, result: ToolResult): string {
    const observation = /^(?:browser_(?:query|snapshot_dom|accessible_tree|read_text(?:_enhanced)?|read_main|control_state|extract_fields|get_summary|get_overview|get_section)|lookup_memories)$/.test(tool);
    this.observationStreak = observation ? this.observationStreak + 1 : 0;
    const focus = observation && this.observationStreak >= 3
      ? 'Several observations have already been collected without an action. If the intended control label is known, use exact text or a scoped role/name target now; do not discover more CSS classes. If a target is still missing or ambiguous, name the missing fact and inspect only that scope. For a reading request, answer from sufficient collected evidence instead of continuing to inspect. This is not a direction to click unknown or ambiguous controls.' : '';

    if (result.ok) {
      this.consecutive = undefined;
      for (const key of this.failures.keys()) {
        const [failedTool, failedInput] = JSON.parse(key);
        if (failedTool === tool && failedInput === input.trim()) this.failures.delete(key);
      }
      return focus;
    }
    const code = result.error?.code ?? 'UNKNOWN';
    const key = this.key(tool, input, code);
    const repeats = (this.failures.get(key) ?? 0) + 1;
    this.failures.set(key, repeats);
    this.consecutive = { tool, code, count: this.consecutive?.tool === tool && this.consecutive.code === code ? this.consecutive.count + 1 : 1 };
    if (!result.error?.repairable) this.denied.add(JSON.stringify([tool, input.trim()]));
    if (!result.error?.repairable) return 'This failure must not be retried automatically. Report it as blocked or choose a different permitted step.';
    return repeats >= 2 || this.consecutive.count >= 3
      ? 'Repeated failure: re-observe the page or change methods. Do not repeat this call.'
      : 'The tool did not accomplish the step. Re-observe the relevant element, adapt stale selectors, and continue the original task.';
  }
}
