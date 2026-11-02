import { redactValue } from './TraceRecorder';
import { compileReplaySteps } from './ReplayStepCompiler';
import { resolveRecordedEntry } from './WorkflowEntryResolver';
import type { ToolTraceEvent, Workflow, WorkflowStep, WorkflowVersion } from './types';
import { buildStableLocator } from './locator';

const now = () => Date.now();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const WORKFLOW_CANDIDATE_TTL_MS = 24 * 60 * 60 * 1000;
const workflowToolName = (toolName: string) =>
  toolName === 'browser_read_main' ? 'browser_read_main_for_workflow' : toolName;

export function compileTrace(trace: ToolTraceEvent[], domain: string, name = 'Recorded workflow', startUrl?: string, taskInstruction?: string, contextMode?: 'current-tab' | 'standalone'): { workflow: Workflow; version: WorkflowVersion } {
  const createdAt = now();
  const recordedSteps: WorkflowStep[] = taskInstruction !== undefined ? compileReplaySteps(trace) : trace
    .filter(event => event.result?.ok !== false)
    .filter((event, index, events) => index === 0 || event.toolName !== events[index - 1].toolName || JSON.stringify(event.input) !== JSON.stringify(events[index - 1].input))
    .map(event => ({
      id: id('step'),
      type: event.toolName === 'browser_navigate' ? 'navigate' : 'action',
      label: event.toolName.replace(/^browser_/, '').replace(/_/g, ' '),
      enabled: true,
      timeoutMs: 15000,
      retryPolicy: { maxAttempts: 1, delayMs: 300 },
      onFailure: 'repair',
      toolName: workflowToolName(event.toolName),
      input: event.input,
      locator: /click|type|keyboard|drag/i.test(event.toolName) ? buildStableLocator(typeof event.input === 'string' ? event.input.split('|', 1)[0] : (event.input as { selector?: string } | undefined)?.selector) : undefined,
      risk: /type|click|keyboard|drag/i.test(event.toolName) ? 'write' : 'read'
    }));
  const entryContext = taskInstruction !== undefined ? resolveRecordedEntry(trace, startUrl, contextMode) : undefined;
  const normalizedStartUrl = entryContext?.kind === 'url' ? entryContext.url : entryContext ? undefined : normalizeHttpUrl(startUrl);
  const firstRecordedUrl = recordedSteps[0]?.toolName === 'browser_navigate'
    ? normalizeHttpUrl(typeof recordedSteps[0].input === 'string' ? recordedSteps[0].input : undefined)
    : undefined;
  const steps: WorkflowStep[] = normalizedStartUrl && firstRecordedUrl !== normalizedStartUrl && !entryContext
    ? [{
        id: id('step'),
        type: 'navigate',
        label: 'Open starting page',
        enabled: true,
        timeoutMs: 15000,
        retryPolicy: { maxAttempts: 1, delayMs: 300 },
        onFailure: 'repair',
        toolName: 'browser_navigate',
        input: normalizedStartUrl,
        risk: 'read'
      }, ...recordedSteps]
    : recordedSteps;

  // Repeating observations cannot reproduce the model's summary/classification.
  // Default new read-only Operator recordings with a saved goal to goal execution.
  // Existing saved/manual Replay rules are not changed here.
  const readOnlyTools = new Set(['browser_get_title', 'browser_get_active_tab', 'browser_query', 'browser_snapshot_dom', 'browser_accessible_tree', 'browser_read_text', 'browser_read_text_enhanced', 'browser_read_main_for_workflow', 'browser_get_summary', 'browser_get_overview', 'browser_get_section', 'browser_extract_links', 'browser_extract_fields', 'browser_control_state']);
  const navigationTools = new Set(['browser_navigate', 'browser_wait_for_navigation', 'browser_navigate_back', 'browser_navigate_forward', 'browser_get_active_tab']);
  const readOnlyGoal = !!taskInstruction?.trim() && recordedSteps.some(step => readOnlyTools.has(step.toolName ?? '')) && recordedSteps.every(step => readOnlyTools.has(step.toolName ?? '') || navigationTools.has(step.toolName ?? ''));
  const version: WorkflowVersion = {
    id: id('version'), workflowId: id('workflow'), version: 1,
    source: 'recording', runStrategy: contextMode === 'standalone' || readOnlyGoal ? 'goal' : 'steps', taskInstruction: taskInstruction === undefined ? undefined : String(redactValue(taskInstruction)), replayFormat: taskInstruction !== undefined ? 'steps-v2' : undefined, entryContext, steps, finalAssertions: [], createdAt
  };
  const workflow: Workflow = {
    id: version.workflowId, name, description: `Recorded on ${domain}`,
    schemaVersion: 1, status: 'candidate', triggerDomains: [domain], variables: [],
    executionMode: entryContext?.kind === 'current_page' ? 'current_tab' : 'new_tab', startUrl: normalizedStartUrl,
    activeVersionId: version.id, expiresAt: createdAt + WORKFLOW_CANDIDATE_TTL_MS,
    createdAt, updatedAt: createdAt
  };
  return { workflow, version };
}

export function normalizeHttpUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function createBlankWorkflow(name = 'New workflow', domain = 'current-site'): { workflow: Workflow; version: WorkflowVersion } {
  const versionId = id('version');
  const workflowId = id('workflow');
  const version: WorkflowVersion = { id: versionId, workflowId, version: 1, source: 'manual_edit', steps: [], finalAssertions: [], createdAt: now() };
  const workflow: Workflow = { id: workflowId, name, description: '', schemaVersion: 1, status: 'draft', triggerDomains: [domain], variables: [], executionMode: 'new_tab', activeVersionId: versionId, createdAt: now(), updatedAt: now() };
  return { workflow, version };
}
