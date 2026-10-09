import type { ToolTraceEvent, WorkflowStep } from './types';
import { buildStableLocator } from './locator';
export function compileReplaySteps(trace: ToolTraceEvent[]): WorkflowStep[] {
  return trace.filter(event => event.result?.ok !== false && !['lookup_memories', 'browser_screenshot'].includes(event.toolName)).map(event => {
    const action = /click|type|keyboard|press_key|drag/.test(event.toolName);
    const selector = typeof event.input === 'string' ? event.toolName === 'browser_type' ? event.input.slice(0, event.input.indexOf('|')) : event.input : undefined;
    const locator = ['browser_click', 'browser_type'].includes(event.toolName) ? buildStableLocator(selector) : undefined;
    if (locator && event.toolName === 'browser_click' && selector && !/[#.\[]/.test(selector) && !/^(role|label|text|testid)=/.test(selector)) {
      locator.text = selector; locator.fallbackOrder = ['text']; delete locator.css;
    }
    return { id: `step-${crypto.randomUUID()}`, type: event.toolName === 'browser_navigate' ? 'navigate' : 'action', label: event.toolName.replace(/^browser_/, '').replace(/_/g, ' '), enabled: true, timeoutMs: 15000, retryPolicy: { maxAttempts: 1, delayMs: 300 }, onFailure: 'repair', toolName: event.toolName === 'browser_read_main' ? 'browser_read_main_for_workflow' : event.toolName, input: event.input, locator, risk: action ? 'write' : 'read' };
  });
}
