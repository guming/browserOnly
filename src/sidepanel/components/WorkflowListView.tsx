import React, { useEffect, useState } from 'react';
import { WorkflowStore, createBlankWorkflow } from '../../workflows';
import type { Workflow } from '../../workflows';
import { WorkflowDetailView } from './WorkflowDetailView';

export function WorkflowListView({ onRunStarted }: { onRunStarted?: () => void } = {}) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [runTarget, setRunTarget] = useState<Workflow | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createWorkflow = async () => {
    const candidate = createBlankWorkflow();
    await WorkflowStore.getInstance().saveVersion(candidate.version);
    await WorkflowStore.getInstance().saveWorkflow(candidate.workflow);
    setWorkflows(current => [...current, candidate.workflow]);
    setSelectedWorkflow(candidate.workflow);
  };
  useEffect(() => { WorkflowStore.getInstance().listWorkflows().then(setWorkflows).catch(() => setWorkflows([])); }, []);
  const exportWorkflow = async (workflow: Workflow) => {
    const version = await WorkflowStore.getInstance().getVersion(workflow.activeVersionId);
    const blob = new Blob([JSON.stringify({ workflow, version }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `${workflow.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'workflow'}.json`, saveAs: true });
  };
  const duplicateWorkflow = async (workflow: Workflow) => {
    const version = await WorkflowStore.getInstance().getVersion(workflow.activeVersionId);
    if (!version) return;
    const newWorkflowId = `workflow-${crypto.randomUUID()}`;
    const newVersion = { ...version, id: `version-${crypto.randomUUID()}`, workflowId: newWorkflowId, version: 1, source: 'manual_edit' as const, createdAt: Date.now() };
    await WorkflowStore.getInstance().saveVersion(newVersion);
    await WorkflowStore.getInstance().saveWorkflow({ ...workflow, id: newWorkflowId, name: `${workflow.name} copy`, activeVersionId: newVersion.id, status: 'draft', createdAt: Date.now(), updatedAt: Date.now() });
    setWorkflows(current => [...current, { ...workflow, id: newWorkflowId, name: `${workflow.name} copy`, activeVersionId: newVersion.id, status: 'draft' }]);
  };
  const archiveWorkflow = async (workflow: Workflow) => {
    await WorkflowStore.getInstance().archiveWorkflow(workflow.id);
    setWorkflows(current => current.map(item => item.id === workflow.id ? { ...item, status: 'archived' } : item));
  };
  if (selectedWorkflow) return <WorkflowDetailView workflow={selectedWorkflow} onBack={() => setSelectedWorkflow(null)} onSaved={updated => { setWorkflows(current => current.map(item => item.id === updated.id ? updated : item)); setSelectedWorkflow(updated); }} />;
  const visibleWorkflows = workflows.filter(workflow => workflow.status !== 'archived');
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-stone-900">Automations</h2><p className="mt-1 text-xs text-stone-500">Save a successful task and run it again anytime.</p></div><div className="relative"><button type="button" onClick={() => setShowCreateMenu(current => !current)} className="rounded-md bg-[#315a78] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#274a64]">+ New</button>{showCreateMenu && <div className="absolute right-0 top-10 z-50 w-52 rounded-lg border border-stone-200 bg-white p-1.5 shadow-lg"><button type="button" onClick={() => { setShowCreateMenu(false); createWorkflow(); }} className="w-full rounded-md px-3 py-2 text-left text-xs text-stone-700 hover:bg-stone-50"><span className="block font-semibold text-stone-900">From a task</span><span className="mt-0.5 block text-[11px] text-stone-500">Start with an editable automation</span></button><button type="button" onClick={() => { setShowCreateMenu(false); createWorkflow(); }} className="w-full rounded-md px-3 py-2 text-left text-xs text-stone-700 hover:bg-stone-50"><span className="block font-semibold text-stone-900">Describe what to do</span><span className="mt-0.5 block text-[11px] text-stone-500">Let BrowserOnly draft the steps</span></button></div>}</div></div>
      {visibleWorkflows.length === 0 ? <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5"><p className="text-sm font-medium text-stone-800">No automations yet</p><p className="mt-1 text-xs leading-5 text-stone-500">Complete a task, then choose “Remember this task” to save it here.</p><button type="button" onClick={createWorkflow} className="mt-3 text-xs font-semibold text-[#315a78] hover:underline">Create a starter automation →</button></div> : visibleWorkflows.map(workflow => (
        <div key={workflow.id} className="rounded-xl border border-stone-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-sm">
          <div className="flex items-start justify-between gap-3"><button type="button" onClick={() => setSelectedWorkflow(workflow)} className="min-w-0 flex-1 text-left"><div className="truncate text-sm font-semibold text-stone-900">{workflow.name}</div><div className="mt-1 truncate text-xs text-stone-500">{workflow.triggerDomains.join(', ') || 'Current webpage'} · {workflow.status === 'draft' ? 'Needs review' : 'Ready to run'}</div></button><button type="button" onClick={() => setRunTarget(workflow)} className="shrink-0 rounded-md bg-[#315a78] px-2.5 py-1.5 text-xs font-semibold text-white">Run</button></div>
          <div className="mt-3 flex items-center gap-3 border-t border-stone-100 pt-2 text-[11px] text-stone-500"><button type="button" onClick={() => setSelectedWorkflow(workflow)} className="hover:text-stone-900">Edit</button><button type="button" onClick={() => duplicateWorkflow(workflow)} className="hover:text-stone-900">Duplicate</button><button type="button" onClick={() => exportWorkflow(workflow)} className="hover:text-stone-900">Export</button><button type="button" onClick={() => archiveWorkflow(workflow)} className="ml-auto hover:text-red-600">Archive</button></div>
        </div>
      ))}
      {runTarget && <RunDialog workflow={runTarget} onClose={() => setRunTarget(null)} onRunStarted={onRunStarted} />}
    </div>
  );
}

function RunDialog({ workflow, onClose, onRunStarted }: { workflow: Workflow; onClose: () => void; onRunStarted?: () => void }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(workflow.variables.map(variable => [variable.key, variable.defaultValue ?? ''])));
  const run = async () => {
    const missing = workflow.variables.filter(variable => variable.required && !String(values[variable.key] ?? '').trim());
    if (missing.length) return;
    onRunStarted?.();
    onClose();
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    chrome.runtime.sendMessage({ action: 'runWorkflow', workflowId: workflow.id, versionId: workflow.activeVersionId, variables: values, tabId: tab?.id }, response => {
      if (chrome.runtime.lastError) console.warn('Workflow run message failed:', chrome.runtime.lastError.message);
      if (response && response.success === false) console.warn('Workflow run failed:', response.error);
    });
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 p-4"><div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-4 shadow-xl"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-stone-900">Run {workflow.name}</h3><button type="button" onClick={onClose} className="text-stone-400">×</button></div>{workflow.variables.length === 0 ? <p className="mb-4 text-xs text-stone-500">This automation has no inputs.</p> : <div className="space-y-3">{workflow.variables.map(variable => <label key={variable.key} className="block text-xs font-medium text-stone-700">{variable.label || variable.key}{variable.required ? ' *' : ''}<input required={variable.required} type={variable.type === 'number' ? 'number' : variable.type === 'date' ? 'date' : variable.type === 'secret' ? 'password' : 'text'} value={String(values[variable.key] ?? '')} onChange={event => setValues(current => ({ ...current, [variable.key]: event.target.value }))} className="mt-1 w-full rounded-md border border-stone-300 px-2.5 py-2 text-sm font-normal outline-none focus:border-[#315a78]" /></label>)}</div>}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-stone-600">Cancel</button><button type="button" onClick={run} className="rounded-md bg-[#315a78] px-3 py-1.5 text-xs font-semibold text-white">Run automation</button></div></div></div>;
}
