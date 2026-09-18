import type { WorkflowExecutionMode, WorkflowVariable, WorkflowVersion } from '../workflows/types';

export type TemplateCategory = 'page' | 'research' | 'shopping' | 'productivity' | 'data' | 'writing';
export interface WorkflowTemplate {
  id: string;
  schemaVersion: 1;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  triggerDomains: string[];
  risk: 'read' | 'write' | 'irreversible';
  executionMode: WorkflowExecutionMode;
  variables: WorkflowVariable[];
  version: Pick<WorkflowVersion, 'steps' | 'finalAssertions'>;
}
export interface TemplateUsageState { templateId: string; useCount: number; lastUsedAt: number; }
