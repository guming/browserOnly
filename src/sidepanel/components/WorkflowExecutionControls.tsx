import React from 'react';
import type { WorkflowEntryContext, WorkflowRunStrategy } from '../../workflows/types';

interface Props {
  strategy: WorkflowRunStrategy;
  entry: WorkflowEntryContext;
  startUrl?: string;
  goalAvailable: boolean;
  allowUrlEntry?: boolean;
  disabled?: boolean;
  onChange: (strategy: WorkflowRunStrategy, entry: WorkflowEntryContext) => void;
}

export function WorkflowExecutionControls({ strategy, entry, startUrl, goalAvailable, allowUrlEntry, disabled, onChange }: Props) {
  const style = 'min-w-0 rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700 focus:border-[#315a78] disabled:opacity-50';
  return <div className="flex flex-wrap gap-2">
    <select aria-label="Execution method" value={strategy} disabled={disabled} className={style} onChange={event => {
      const next = event.target.value as WorkflowRunStrategy;
      onChange(next, next === 'steps' && entry.kind === 'standalone' ? { kind: 'current_page' } : entry);
    }}>
      <option value="steps">Replay rules</option>
      <option value="goal" disabled={!goalAvailable}>Explore by goal</option>
    </select>
    <select aria-label="Task starting point" value={entry.kind} disabled={disabled} className={style} onChange={event => {
      const kind = event.target.value as WorkflowEntryContext['kind'];
      onChange(kind === 'standalone' ? 'goal' : strategy, kind === 'url' ? { kind, url: startUrl ?? '' } : { kind });
    }}>
      <option value="current_page">Current page</option>
      <option value="url" disabled={!startUrl && !allowUrlEntry}>Saved webpage</option>
      <option value="standalone" disabled={!goalAvailable}>Start independently</option>
    </select>
  </div>;
}
