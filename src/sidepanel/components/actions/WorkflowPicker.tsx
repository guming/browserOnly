import React, { useEffect, useMemo, useState } from 'react';
import { TemplateCatalog, type WorkflowTemplate } from '../../../templates';
import { WorkflowStore } from '../../../workflows/WorkflowStore';
import type { Workflow } from '../../../workflows/types';

export function WorkflowPicker({ pageUrl, onClose, onWorkflow, onTemplate }: { pageUrl: string; onClose: () => void; onWorkflow: (workflow: Workflow) => void; onTemplate: (template: WorkflowTemplate) => void }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  useEffect(() => { WorkflowStore.getInstance().listWorkflows().then(setWorkflows).catch(() => setWorkflows([])); }, []);
  const hostname = useMemo(() => { try { return new URL(pageUrl).hostname; } catch { return ''; } }, [pageUrl]);
  const matching = workflows.filter(workflow => workflow.status !== 'archived' && (!workflow.triggerDomains.length || workflow.triggerDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))));
  const templates = new TemplateCatalog().search({ category: 'page', url: pageUrl }).slice(0, 5);
  return <section aria-label="Applicable workflows" className="mb-3 rounded-lg border border-stone-200 p-3"><div className="flex justify-between"><h3 className="text-sm font-semibold">Workflows for this page</h3><button type="button" aria-label="Close workflow picker" onClick={onClose}>×</button></div><div className="mt-2 divide-y">{matching.map(workflow => <button type="button" key={workflow.id} onClick={() => onWorkflow(workflow)} className="block w-full py-2 text-left text-xs"><strong>{workflow.name}</strong><span className="block text-stone-500">{workflow.description}</span></button>)}{templates.map(template => <button type="button" key={template.id} onClick={() => onTemplate(template)} className="block w-full py-2 text-left text-xs"><strong>{template.name}</strong><span className="block text-stone-500">Template · {template.description}</span></button>)}{matching.length === 0 && templates.length === 0 && <p className="py-3 text-xs text-stone-500">No workflows match this page.</p>}</div></section>;
}
