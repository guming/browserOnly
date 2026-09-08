import React, { useEffect, useState } from 'react';
import { WorkflowStore } from '../../workflows';
import type { WorkflowRun, WorkflowStepRun } from '../../workflows';

export function RunDetailView({ run, onBack }: { run: WorkflowRun; onBack: () => void }) {
  const [steps, setSteps] = useState<WorkflowStepRun[]>([]);
  useEffect(() => { WorkflowStore.getInstance().listStepRuns(run.id).then(setSteps).catch(() => setSteps([])); }, [run.id]);
  const duration = run.endedAt ? `${((run.endedAt - run.startedAt) / 1000).toFixed(1)}s` : 'running';
  const viewPage = () => { if (run.executionTabId !== undefined) chrome.tabs.update(run.executionTabId, { active: true }); };
  const cancel = () => { chrome.runtime.sendMessage({ action: 'cancelWorkflow', runId: run.id }); };
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><button type="button" onClick={onBack} className="text-xs font-medium text-stone-500 hover:text-stone-900">← Runs</button><div className="flex items-center gap-2"><button type="button" disabled={run.executionTabId === undefined} onClick={viewPage} className="rounded-md border border-stone-300 px-2 py-1 text-[11px] text-stone-700 disabled:opacity-50">View page</button>{run.status === 'running' && <button type="button" onClick={cancel} className="rounded-md border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700">Cancel</button>}<span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${run.status === 'succeeded' ? 'bg-emerald-50 text-emerald-700' : run.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-600'}`}>{run.status}</span></div></div>
    <div><h2 className="text-base font-semibold text-stone-900">Run details</h2><p className="mt-1 text-[11px] text-stone-500">{new Date(run.startedAt).toLocaleString()} · {duration}</p></div>
    <div className="grid grid-cols-3 gap-2"><Metric label="LLM calls" value={String(run.llmCalls)} /><Metric label="Tokens" value={String(run.inputTokens + run.outputTokens)} /><Metric label="Cost" value={`$${run.cost.toFixed(4)}`} /></div>
    <div className="space-y-2"><h3 className="text-sm font-semibold text-stone-900">Steps</h3>{steps.length === 0 ? <p className="text-xs text-stone-500">No step records available.</p> : steps.map((step, index) => <div key={step.id} className="flex gap-3 rounded-lg border border-stone-200 bg-white p-3"><div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${step.status === 'succeeded' ? 'bg-emerald-100 text-emerald-700' : step.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-600'}`}>{step.status === 'succeeded' ? '✓' : step.status === 'failed' ? '!' : index + 1}</div><div className="min-w-0"><div className="text-xs font-medium text-stone-800">Step {index + 1} · {step.status}</div>{step.errorMessage && <div className="mt-1 break-words text-[11px] text-red-600">{step.errorMessage}</div>}<div className="mt-1 text-[10px] text-stone-400">{step.endedAt ? `${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s` : 'running'}</div></div></div>)}</div>
    {run.failureMessage && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><div className="font-semibold">Failure</div><div className="mt-1 break-words">{run.failureMessage}</div></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-stone-50 px-2.5 py-2"><div className="text-[10px] uppercase tracking-wide text-stone-400">{label}</div><div className="mt-1 text-xs font-semibold text-stone-800">{value}</div></div>; }
