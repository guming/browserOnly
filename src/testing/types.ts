export type TestAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; target: TestTarget; risk?: 'read' | 'write' }
  | { type: 'fill'; target: TestTarget; value: string; sensitive?: boolean }
  | { type: 'press'; key: 'Enter' | 'Tab' | 'Escape' | 'ArrowDown' | 'ArrowUp' };

export interface TestTarget {
  placeholder?: string;
  role?: string;
  name?: string;
  label?: string;
  testId?: string;
  css?: string;
}

export interface TestStep {
  id: string;
  act?: TestAction;
  assert?: {
    type: 'url_matches' | 'element_visible' | 'element_absent' | 'text_present' | 'value_equals';
    target?: TestTarget;
    expected?: string;
    timeoutMs?: number;
  };
}

export interface TestCaseDefinition {
  id: string;
  name: string;
  description?: string;
  needsReview?: boolean;
  steps: TestStep[];
}

export interface TestSuiteDocument {
  schemaVersion: 1;
  suiteId: string;
  name: string;
  site: string;
  allowedDomains: string[];
  cases: TestCaseDefinition[];
}

export interface TestSuiteRecord extends Omit<TestSuiteDocument, 'cases'> {
  createdAt: number;
  updatedAt: number;
  draftYaml?: string;
  previousDraftYaml?: string;
}

export interface TestCaseRecord {
  id: string;
  suiteId: string;
  name: string;
  activeVersionId: string;
  draftYaml?: string;
  updatedAt: number;
}

export interface TestCaseVersion {
  id: string;
  suiteId: string;
  caseId: string;
  version: number;
  definition: TestCaseDefinition;
  source: 'import' | 'edit' | 'generated' | 'restore';
  createdAt: number;
}

export type TestRunStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'interrupted';
export type TestCaseRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'blocked' | 'cancelled' | 'skipped';

export interface TestSuiteRun {
  id: string;
  suiteId: string;
  status: TestRunStatus;
  concurrency: number;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  ownerWindowId: number;
  cancelRequested?: boolean;
}

export interface TestCaseRun {
  id: string;
  suiteRunId: string;
  suiteId: string;
  caseId: string;
  caseVersionId: string;
  status: TestCaseRunStatus;
  tabId?: number;
  windowId?: number;
  startedAt?: number;
  endedAt?: number;
  failureMessage?: string;
}

export interface TestStepResult {
  id: string;
  caseRunId: string;
  stepId: string;
  status: Exclude<TestCaseRunStatus, 'queued' | 'running' | 'skipped'>;
  expected?: string;
  actual?: string;
  url?: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt: number;
  endedAt: number;
  screenshot?: string;
}

export interface TestImportDiff {
  added: TestCaseDefinition[];
  changed: TestCaseDefinition[];
  unchanged: TestCaseDefinition[];
  missing: TestCaseRecord[];
}
