import React, { useEffect, useState } from 'react';
import { WorkflowStore } from '../../workflows';
import type { WorkflowRun } from '../../workflows';
import { RunDetailView } from './RunDetailView';

export function RunListView() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  useEffect(() => {
    const load = () => WorkflowStore.getInstance().listRuns().then(result => setRuns(result.sort((a, b) => b.startedAt - a.startedAt))).catch(() => setRuns([]));
    load();
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, []);
  if (selectedRun) return <RunDetailView run={selectedRun} onBack={() => setSelectedRun(null)} />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-stone-900">Runs</h2><button type="button" className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs text-stone-700">Filter</button></div>
      {runs.length === 0 ? <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-xs leading-5 text-stone-600">Workflow execution history will appear here.</p> : runs.map(run => (
        <button type="button" key={run.id} onClick={() => setSelectedRun(run)} className="block w-full border-b border-stone-200 py-3 text-left hover:bg-stone-50"><div className="flex items-center justify-between text-sm"><span className="font-medium text-stone-900">{run.status}</span><span className="text-[11px] text-stone-500">{new Date(run.startedAt).toLocaleString()}</span></div><div className="mt-1 text-[11px] text-stone-500">{run.llmCalls} LLM calls · ${run.cost.toFixed(4)} · {run.endedAt ? `${((run.endedAt - run.startedAt) / 1000).toFixed(1)}s` : 'running'}</div></button>
      ))}
    </div>
  );
}
