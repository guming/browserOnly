import React, { useEffect, useState } from 'react';
import { WorkflowStore } from '../../workflows';
import type { WorkflowRun } from '../../workflows';
import { RunDetailView } from './RunDetailView';
import { runResultLabel, runStatusLabel } from '../../workflows/runPresentation';

export function RunListView() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const load = () => { const store = WorkflowStore.getInstance(); void Promise.all([store.listRuns(), store.listWorkflows()]).then(([result, workflows]) => { setRuns(result.sort((a, b) => b.startedAt - a.startedAt)); setNames(Object.fromEntries(workflows.map(item => [item.id, item.name]))); }).catch(() => setRuns([])); };
    load();
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, []);
  if (selectedRun) return <RunDetailView run={selectedRun} onBack={() => setSelectedRun(null)} />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-stone-900">Runs</h2><button type="button" className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs text-stone-700">Filter</button></div>
      {runs.length === 0 ? <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-xs leading-5 text-stone-600">Workflow execution history will appear here.</p> : runs.map(run => (
        <button type="button" key={run.id} onClick={() => setSelectedRun(run)} className="block w-full border-b border-stone-200 py-3 text-left hover:bg-stone-50"><div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium text-stone-900">{names[run.workflowId] || 'Saved task'}</span><span className="shrink-0 text-[11px] text-stone-500">{runStatusLabel(run)}</span></div>{runResultLabel(run) && <div className="mt-1 text-xs font-semibold text-stone-800">{runResultLabel(run)}</div>}{run.failureMessage && run.status === 'failed' && <div className="mt-1 line-clamp-2 text-xs text-red-700">{run.failureMessage}</div>}<div className="mt-1 text-[11px] text-stone-500">{new Date(run.startedAt).toLocaleString()}</div></button>
      ))}
    </div>
  );
}
