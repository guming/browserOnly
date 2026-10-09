import type { ToolTraceEvent, WorkflowEntryContext, WorkflowVersion } from './types';

const preparation = new Set(['lookup_memories', 'browser_screenshot']);
export function resolveRecordedEntry(trace: ToolTraceEvent[], sourceUrl?: string): WorkflowEntryContext {
  const first = trace.find(event => event.result?.ok !== false && !preparation.has(event.toolName));
  if (first?.toolName === 'browser_navigate' && typeof first.input === 'string') {
    const url = httpUrl(first.input);
    if (url) return { kind: 'url', url };
  }
  const url = httpUrl(sourceUrl);
  return url ? { kind: 'url', url } : { kind: 'current_page' };
}
export function replayEntry(version: WorkflowVersion): WorkflowEntryContext | undefined {
  return version.replayFormat === 'steps-v2' ? version.entryContext : undefined;
}
function httpUrl(value?: string): string | undefined {
  try { const url = new URL(value ?? ''); return /^https?:$/.test(url.protocol) ? url.toString() : undefined; }
  catch { return undefined; }
}
