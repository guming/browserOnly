import React from 'react';

interface ApprovalRequestProps {
  requestId: string;
  toolName: string;
  toolInput: string;
  reason: string;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

export function ApprovalRequest({ requestId, toolName, toolInput, reason, onApprove, onReject }: ApprovalRequestProps) {
  return (
    <section aria-label="Action approval" className="my-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
      <div className="flex items-start gap-3 p-4">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e9f0f4] text-lg text-[#315a78]">✦</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-stone-900">Review this action</h3>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Waiting for you</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-600">BrowserOnly needs your approval to continue.</p>
          <div className="mt-3 rounded-lg border border-stone-200 bg-[#faf9f7] px-3 py-2.5 text-xs leading-5">
            <p className="font-semibold text-stone-800">{toolName.replace(/^browser_/, '').replace(/_/g, ' ')}</p>
            {toolInput && <p className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-stone-600">{toolInput}</p>}
          </div>
          {reason && <p className="mt-2 text-xs leading-5 text-stone-500">{reason}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onApprove(requestId)} className="rounded-md bg-[#315a78] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#274a64] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315a78]">Approve action</button>
            <button type="button" onClick={() => onReject(requestId)} className="rounded-md border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315a78]">Reject</button>
          </div>
        </div>
      </div>
    </section>
  );
}
