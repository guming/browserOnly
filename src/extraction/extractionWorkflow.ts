import type { Workflow, WorkflowVersion } from '../workflows/types';
import type { ExtractionRequest } from './types';

export function createExtractionWorkflow(request: ExtractionRequest, name = 'Structured extraction'): { workflow: Workflow; version: WorkflowVersion } {
  const workflowId = `workflow-${crypto.randomUUID()}`;
  const versionId = `version-${crypto.randomUUID()}`;
  const now = Date.now();
  const version: WorkflowVersion = {
    id: versionId, workflowId, version: 1, source: 'manual_edit', createdAt: now,
    steps: [
      { id: 'extract', type: 'ai_step', label: 'Extract structured data', enabled: true, timeoutMs: 30_000, retryPolicy: { maxAttempts: 1, delayMs: 250 }, onFailure: 'stop', toolName: 'browser_extract_structured', input: request, risk: 'read' },
      ...(request.outputFormat === 'csv' || request.outputFormat === 'json' ? [{ id: 'export', type: 'action' as const, label: `Download ${request.outputFormat.toUpperCase()}`, enabled: true, timeoutMs: 15_000, retryPolicy: { maxAttempts: 1, delayMs: 250 }, onFailure: 'stop' as const, toolName: 'browser_export_data', input: { format: request.outputFormat, previousResult: true }, risk: 'write' as const }] : []),
    ],
    finalAssertions: request.outputFormat === 'csv' || request.outputFormat === 'json' ? [{ type: 'download_exists', expected: true, timeoutMs: 1_000 }] : [{ type: 'row_count', expected: { min: 1 }, timeoutMs: 1_000 }],
  };
  return { workflow: { id: workflowId, name, description: `Extract ${request.fields.map(field => field.label).join(', ')}`, schemaVersion: 1, status: 'draft', triggerDomains: [], variables: [], executionMode: 'current_tab', activeVersionId: versionId, createdAt: now, updatedAt: now }, version };
}
