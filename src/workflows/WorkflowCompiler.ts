import type { ToolTraceEvent, Workflow, WorkflowStep, WorkflowVersion } from './types';
import { buildStableLocator } from './locator';

const now = () => Date.now();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const WORKFLOW_CANDIDATE_TTL_MS = 24 * 60 * 60 * 1000;
const workflowToolName = (toolName: string) =>
  toolName === 'browser_read_main' ? 'browser_read_main_for_workflow' : toolName;

export function compileTrace(trace: ToolTraceEvent[], domain: string, name = 'Recorded workflow', startUrl?: string): { workflow: Workflow; version: WorkflowVersion } {
  const createdAt = now();
  const recordedSteps: WorkflowStep[] = trace
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
  const normalizedStartUrl = normalizeHttpUrl(startUrl);
  const firstRecordedUrl = recordedSteps[0]?.toolName === 'browser_navigate'
    ? normalizeHttpUrl(typeof recordedSteps[0].input === 'string' ? recordedSteps[0].input : undefined)
    : undefined;
  const steps: WorkflowStep[] = normalizedStartUrl && firstRecordedUrl !== normalizedStartUrl
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

  const version: WorkflowVersion = {
    id: id('version'), workflowId: id('workflow'), version: 1,
    source: 'recording', steps, finalAssertions: [], createdAt
  };
  const workflow: Workflow = {
    id: version.workflowId, name, description: `Recorded on ${domain}`,
    schemaVersion: 1, status: 'candidate', triggerDomains: [domain], variables: [],
    executionMode: 'new_tab', startUrl: normalizedStartUrl,
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
