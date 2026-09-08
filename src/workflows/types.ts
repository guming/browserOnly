export type WorkflowStatus = 'draft' | 'active' | 'archived';
export type WorkflowRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'repairing';

export type WorkflowVariableType = 'string' | 'number' | 'date' | 'boolean' | 'secret';

export interface WorkflowVariable {
  key: string;
  label: string;
  type: WorkflowVariableType;
  required: boolean;
  defaultValue?: unknown;
}

export interface StableLocator {
  role?: string;
  accessibleName?: string;
  label?: string;
  text?: string;
  testId?: string;
  css?: string;
  framePath?: string[];
  fallbackOrder: Array<'role' | 'label' | 'text' | 'testId' | 'css'>;
}

export interface WorkflowAssertion {
  type: 'url_matches' | 'element_visible' | 'element_absent' | 'text_present' | 'value_equals' | 'row_count' | 'download_exists';
  expected: unknown;
  locator?: StableLocator;
  timeoutMs: number;
}

export interface WorkflowRetryPolicy {
  maxAttempts: number;
  delayMs: number;
}

export interface WorkflowStep {
  id: string;
  type: 'action' | 'navigate' | 'wait' | 'assertion' | 'ai_step';
  label: string;
  enabled: boolean;
  timeoutMs: number;
  retryPolicy: WorkflowRetryPolicy;
  onFailure: 'stop' | 'repair';
  toolName?: string;
  input?: unknown;
  locator?: StableLocator;
  preconditions?: WorkflowAssertion[];
  postconditions?: WorkflowAssertion[];
  risk?: 'read' | 'write' | 'irreversible';
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  schemaVersion: 1;
  status: WorkflowStatus;
  triggerDomains: string[];
  variables: WorkflowVariable[];
  activeVersionId: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  source: 'recording' | 'manual_edit' | 'ai_repair';
  sourceRunId?: string;
  steps: WorkflowStep[];
  finalAssertions: WorkflowAssertion[];
  createdAt: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  versionId: string;
  status: WorkflowRunStatus;
  startedAt: number;
  endedAt?: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  failureStepId?: string;
  failureMessage?: string;
}

export interface WorkflowStepRun {
  id: string;
  runId: string;
  stepId: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  startedAt: number;
  endedAt?: number;
  errorCode?: string;
  errorMessage?: string;
  screenshotId?: string;
}

export interface ToolTraceEvent {
  executionId: string;
  toolName: string;
  input: unknown;
  result?: { ok: boolean; data?: unknown; error?: { code: string; message: string; repairable: boolean } };
  startedAt: number;
  endedAt?: number;
  tabId?: number;
  windowId?: number;
}

export interface WorkflowPatch {
  targetStepId: string;
  changes: {
    locator?: StableLocator;
    timeoutMs?: number;
    preconditions?: WorkflowAssertion[];
    postconditions?: WorkflowAssertion[];
  };
  reason: string;
  confidence: number;
}
