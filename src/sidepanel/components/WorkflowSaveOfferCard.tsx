import React, { useEffect, useState } from 'react';
import { WorkflowStore } from '../../workflows/WorkflowStore';
import type { Workflow, WorkflowVersion } from '../../workflows/types';

export function WorkflowSaveOfferCard({ workflowId, onOpenWorkflow }: { workflowId: string; onOpenWorkflow?: (workflowId: string) => void }) {
  const [workflow, setWorkflow] = useState<Workflow>();
  const [version, setVersion] = useState<WorkflowVersion>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const store = WorkflowStore.getInstance();
        const candidate = await store.getWorkflow(workflowId);
        const candidateVersion = candidate && await store.getVersion(candidate.activeVersionId);
        if (!cancelled) { setWorkflow(candidate); setVersion(candidateVersion); setSaved(candidate?.status === 'active'); }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }
    })();
    return () => { cancelled = true; };
  }, [workflowId]);

  const saveToLatest = async () => {
    if (!workflow || !version || busy) return;
    setBusy(true); setError('');
    try {
      const store = WorkflowStore.getInstance();
      const current = await store.getWorkflow(workflowId);
      if (!current || current.status === 'archived') throw new Error('This workflow draft is no longer available.');
      const nextWorkflow: Workflow = { ...current, status: 'active', expiresAt: undefined, updatedAt: Date.now() };
      await store.saveWorkflow(nextWorkflow);
      setWorkflow(nextWorkflow);
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save this task.'); }
    finally { setBusy(false); }
  };

  if (!workflow || !version) return <section className="my-3 overflow-hidden rounded-xl border border-[#e7e1d8] bg-[#fbfaf8] text-xs text-stone-600 shadow-[0_8px_24px_rgba(42,37,31,0.06)]" aria-label="Save task to workflow">
    <div className="flex items-center gap-3 p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e9f0f4] text-[#315a78]">✦</span><div><p className="font-semibold tracking-tight text-stone-900">A new workflow, almost ready</p><p className="mt-0.5">{error || 'Preparing your successful task…'}</p></div></div>
  </section>;

  return <section className="my-3 overflow-hidden rounded-xl border border-[#e7e1d8] bg-[#fbfaf8] shadow-[0_8px_24px_rgba(42,37,31,0.06)]" aria-label="Save task to workflow">
    <div className="flex items-start gap-3 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e9f0f4] text-lg text-[#315a78]" aria-hidden="true">✦</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold tracking-tight text-stone-900">Nice. That worked.</h3><span className="rounded-full bg-[#e8eee8] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[#526b56]">Task complete</span></div>
        <p className="mt-1 text-xs leading-5 text-stone-600">{saved ? 'This workflow is ready to run again whenever you need it.' : 'Keep this flow close. Save it as a workflow and run it again anytime.'}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {saved ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8eee8] px-3 py-1.5 text-xs font-medium text-[#526b56]"><span aria-hidden="true">✓</span> Workflow saved</span> : <button type="button" disabled={busy} onClick={() => void saveToLatest()} className="inline-flex items-center gap-2 rounded-full bg-[#253f52] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1d3343] disabled:opacity-50">{busy ? 'Saving…' : 'Save workflow'}{!busy && <span aria-hidden="true">↗</span>}</button>}
          {onOpenWorkflow && <button type="button" onClick={() => onOpenWorkflow(workflowId)} className="rounded-full px-3 py-2 text-xs font-medium text-stone-500 transition hover:bg-white hover:text-stone-800">{saved ? 'View workflow' : 'Preview task'}</button>}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    </div>
  </section>;
}
