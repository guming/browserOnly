import type { Workflow, WorkflowVersion } from '../workflows/types';
import type { WorkflowTemplate } from './types';
export function instantiateTemplate(template: WorkflowTemplate): { workflow: Workflow; version: WorkflowVersion } {
  const workflowId = `workflow-${uuid()}`; const versionId = `version-${uuid()}`; const now = Date.now();
  return { workflow: { id: workflowId, name: template.name, description: template.description, schemaVersion: 1, status: 'draft', triggerDomains: [...template.triggerDomains], variables: clone(template.variables), activeVersionId: versionId, executionMode: template.executionMode, createdAt: now, updatedAt: now }, version: { id: versionId, workflowId, version: 1, source: 'template', steps: clone(template.version.steps), finalAssertions: clone(template.version.finalAssertions), createdAt: now } };
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function uuid(): string { return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
