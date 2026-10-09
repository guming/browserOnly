import React, { useEffect, useState } from 'react';
import { OfficeReportView } from './office/OfficeReportView';
import { WorkflowStore } from '../../workflows';
import type { WorkflowRun, WorkflowStepRun, WorkflowTraceEvent } from '../../workflows';

export function RunDetailView({ run, onBack }: { run: WorkflowRun; onBack: () => void }) {
  const [trace, setTrace] = useState<WorkflowTraceEvent[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState('');
  useEffect(() => { void WorkflowStore.getInstance().listTraceEvents(run.id).then(setTrace).catch(() => setTrace([])); }, [run.id, run.endedAt]);
  const acceptSuggestion = async () => {
    try {
      const store = WorkflowStore.getInstance();
      const workflow = await store.getWorkflow(run.workflowId);
      const version = run.suggestedVersionId ? await store.getVersion(run.suggestedVersionId) : undefined;
      if (!workflow || !version) throw new Error('Repair suggestion unavailable');
      if (workflow.activeVersionId !== run.versionId) throw new Error('Task changed since this run. Review the suggestion in task details.');
      await store.activateVersion(workflow, version); setSuggestionStatus('Repair version saved');
    } catch (error) { setSuggestionStatus(String(error)); }
  };
  const [steps, setSteps] = useState<WorkflowStepRun[]>([]);
  useEffect(() => { const load = () => WorkflowStore.getInstance().listStepRuns(run.id).then(setSteps).catch(() => setSteps([])); void load(); const timer = window.setInterval(load, 2000); return () => window.clearInterval(timer); }, [run.id]);
  const duration = run.endedAt ? `${((run.endedAt - run.startedAt) / 1000).toFixed(1)}s` : 'running';
  const viewPage = () => { if (run.executionTabId !== undefined) chrome.tabs.update(run.executionTabId, { active: true }); };
  const cancel = () => { chrome.runtime.sendMessage({ action: 'cancelWorkflow', runId: run.id }); };
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><button type="button" onClick={onBack} className="text-xs font-medium text-stone-500 hover:text-stone-900">← Runs</button><div className="flex items-center gap-2"><button type="button" disabled={run.executionTabId === undefined} onClick={viewPage} className="rounded-md border border-stone-300 px-2 py-1 text-[11px] text-stone-700 disabled:opacity-50">View page</button>{run.status === 'running' && <button type="button" onClick={cancel} className="rounded-md border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700">Cancel</button>}<span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${run.status === 'succeeded' ? 'bg-emerald-50 text-emerald-700' : run.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-600'}`}>{run.status}</span></div></div>
    <div><h2 className="text-base font-semibold text-stone-900">Run details</h2><p className="mt-1 text-[11px] text-stone-500">{new Date(run.startedAt).toLocaleString()} · {duration}</p></div>
    <div className="grid grid-cols-3 gap-2"><Metric label="LLM calls" value={String(run.llmCalls)} /><Metric label="Tokens" value={run.llmCalls && !run.inputTokens && !run.outputTokens ? 'Unavailable' : String(run.inputTokens + run.outputTokens)} /><Metric label="Cost" value={run.llmCalls && !run.cost ? 'Unavailable' : `$${run.cost.toFixed(4)}`} /></div>
    {run.status === 'succeeded' && run.verification && <p className="text-xs">{run.verification === 'verified' ? 'Goal verified by final assertions' : 'Execution finished; goal has not been verified'}</p>}
    {run.suggestedVersionId && <div><button onClick={acceptSuggestion}>Save repair suggestion</button><p role="status">{suggestionStatus}</p></div>}
    {run.traceIncomplete && <p role="alert">Some execution trace events could not be saved.</p>}
    <details><summary>Execution trace</summary>{trace.map(event => <p key={event.id} className="text-xs">{event.sequence + 1}. {event.kind}: {event.message}</p>)}</details>
    <div className="space-y-2"><h3 className="text-sm font-semibold text-stone-900">Steps</h3>{steps.length === 0 ? <p className="text-xs text-stone-500">No step records available.</p> : steps.map((step, index) => <div key={step.id} className="flex gap-3 rounded-lg border border-stone-200 bg-white p-3"><div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${step.status === 'succeeded' ? 'bg-emerald-100 text-emerald-700' : step.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-600'}`}>{step.status === 'succeeded' ? '✓' : step.status === 'failed' ? '!' : index + 1}</div><div className="min-w-0"><div className="text-xs font-medium text-stone-800">Step {index + 1} · {step.status} · {step.executionMode ?? 'direct'} · repairs: {step.repairAttempts ?? 0}</div>{step.errorMessage && <div className="mt-1 break-words text-[11px] text-red-600">{step.errorMessage}</div>}<div className="mt-1 text-[10px] text-stone-400">{step.endedAt ? `${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s` : 'running'}</div></div></div>)}</div>
    {steps.filter(step => step.officeReport).map(step => <OfficeReportView key={step.id} report={step.officeReport!} runId={run.id} stepRunId={step.id} running={step.status === 'running'} />)}
    {run.failureMessage && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><div className="font-semibold">Failure</div><div className="mt-1 break-words">{run.failureMessage}</div></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-stone-50 px-2.5 py-2"><div className="text-[10px] uppercase tracking-wide text-stone-400">{label}</div><div className="mt-1 text-xs font-semibold text-stone-800">{value}</div></div>; }
