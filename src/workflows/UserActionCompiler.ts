import { buildStableLocatorFromElement } from './locator';
import type { Workflow, WorkflowStep, WorkflowVariable, WorkflowVersion } from './types';

export interface UserRecordedAction {
  kind: 'click' | 'input' | 'change' | 'navigate';
  label: string;
  selector?: string;
  role?: string;
  testId?: string;
  url?: string;
}

export function compileUserActions(actions: UserRecordedAction[], name: string, startUrl: string, domain: string): { workflow: Workflow; version: WorkflowVersion } {
  const now = Date.now();
  const workflowId = `workflow-${crypto.randomUUID()}`;
  const versionId = `version-${crypto.randomUUID()}`;
  const variables: WorkflowVariable[] = [];
  const steps: WorkflowStep[] = actions.map((action, index) => {
    const variableKey = `input_${index + 1}`;
    const input = action.kind === 'navigate' ? action.url : action.kind === 'input' || action.kind === 'change' ? `${action.selector}|{{${variableKey}}}` : action.selector;
    if (action.kind === 'input' || action.kind === 'change') variables.push({ key: variableKey, label: action.label, type: 'string', required: true });
    const locator = action.kind === 'navigate' ? undefined : buildStableLocatorFromElement({ role: action.role, accessibleName: action.label, label: action.kind === 'input' ? action.label : undefined, testId: action.testId, css: action.selector });
    return { id: `step-${crypto.randomUUID()}`, type: action.kind === 'navigate' ? 'navigate' : 'action', label: action.kind === 'navigate' ? `Open ${action.label}` : `${action.kind === 'click' ? 'Click' : action.kind === 'change' ? 'Select' : 'Fill'} “${action.label}”`, enabled: true, timeoutMs: 15000, retryPolicy: { maxAttempts: 1, delayMs: 300 }, onFailure: 'repair', toolName: action.kind === 'navigate' ? 'browser_navigate' : action.kind === 'click' ? 'browser_click' : action.kind === 'change' ? 'browser_select' : 'browser_type', input, locator, risk: action.kind === 'navigate' ? 'read' : 'write' };
  });
  const version: WorkflowVersion = { id: versionId, workflowId, version: 1, source: 'recording', runStrategy: 'steps', replayFormat: 'steps-v2', entryContext: { kind: 'url', url: startUrl }, steps, finalAssertions: [], createdAt: now };
  const workflow: Workflow = { id: workflowId, name, description: `Recorded on ${domain}`, schemaVersion: 1, status: 'draft', triggerDomains: [domain], variables, executionMode: 'new_tab', startUrl, activeVersionId: versionId, createdAt: now, updatedAt: now };
  return { workflow, version };
}
