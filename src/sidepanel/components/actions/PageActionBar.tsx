import React from 'react';

export function PageActionBar({ readable, disabled, onSummarize, onTranslate, onExtract, onWorkflows }: { readable: boolean; disabled?: boolean; onSummarize: () => void; onTranslate: () => void; onExtract: () => void; onWorkflows: () => void }) {
  if (!readable) return null;
  const actions = [{ label: 'Summarize', run: onSummarize }, { label: 'Translate', run: onTranslate }, { label: 'Extract', run: onExtract }, { label: 'Workflows', run: onWorkflows }];
  return <div aria-label="Current page actions" className="flex shrink-0 items-center gap-1"><span className="mr-1 shrink-0 text-[11px] font-semibold text-stone-500">Current page</span>{actions.map(item => <button key={item.label} type="button" disabled={disabled} onClick={item.run} className="min-h-8 shrink-0 rounded-md px-2 text-xs text-[#315a78] hover:bg-[#eaf2f7] disabled:opacity-50">{item.label}</button>)}</div>;
}
