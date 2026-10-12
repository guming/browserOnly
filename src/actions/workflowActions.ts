import type { Workflow } from '../workflows/types';
import type { ActionDefinition } from './types';

export function createWorkflowActions(workflows: readonly Workflow[]): ActionDefinition[] {
  const used = new Set<string>();
  return workflows.filter(workflow => workflow.status !== 'archived').slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).map(workflow => {
    const base = slug(workflow.name) || 'workflow';
    let alias = base;
    if (used.has(alias)) alias = `${base}-${workflow.id.replace(/[^a-z0-9]/gi, '').slice(-4).toLowerCase()}`;
    used.add(alias);
    return {
      id: `workflow:${workflow.id}`,
      kind: 'workflow',
      slashCommand: `/${alias}`,
      name: workflow.name,
      description: workflow.description,
      keywords: [workflow.name, workflow.description],
      runBehavior: workflow.variables?.length ? 'configure' : 'confirm',
      supportedContexts: workflow.executionMode === 'current_tab' ? ['page'] : ['page', 'tabs'],
      workflowId: workflow.id,
      triggerDomains: workflow.triggerDomains,
    };
  });
}

function slug(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}
