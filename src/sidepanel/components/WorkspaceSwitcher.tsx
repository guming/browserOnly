import React, { useState, useRef, useEffect } from 'react';

export type WorkspaceView = 'tasks' | 'workflows' | 'monitors' | 'runs';

interface WorkspaceSwitcherProps {
  value: WorkspaceView;
  onChange: (value: WorkspaceView) => void;
  workflowCount?: number;
  failedRunCount?: number;
  monitorCount?: number;
}

export function WorkspaceSwitcher({ value, onChange, workflowCount = 0, failedRunCount = 0, monitorCount = 0 }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div ref={ref} className="relative inline-flex items-center rounded-lg border border-stone-200 bg-stone-100 p-0.5">
      {(['tasks', 'workflows', 'monitors'] as const).map(item => (
        <button key={item} type="button" onClick={() => onChange(item)} aria-current={value === item ? 'page' : undefined}
          className={`min-h-8 rounded-md px-2.5 text-xs font-semibold transition-colors ${value === item ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>
          {item === 'tasks' ? 'Tasks' : item === 'workflows' ? <>Automations{workflowCount ? <span className="ml-1 text-[10px] text-stone-400">{workflowCount}</span> : null}</> : <>Monitors{monitorCount ? <span className="ml-1 text-[10px] text-stone-400">{monitorCount}</span> : null}</>}
        </button>
      ))}
      <button type="button" aria-label="More workspace views" aria-expanded={open} onClick={() => setOpen(current => !current)}
        className={`ml-0.5 min-h-8 rounded-md px-2 text-sm text-stone-500 transition-colors hover:text-stone-900 ${value === 'runs' ? 'bg-white text-stone-900 shadow-sm' : ''}`}>⋯</button>
      {open && <div className="absolute left-0 top-[calc(100%+8px)] z-[80] min-w-44 rounded-lg border border-stone-200 bg-white p-1.5 shadow-lg">
        <button type="button" onClick={() => { onChange('runs'); setOpen(false); }} className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium text-stone-700 hover:bg-stone-50">
          <span>Execution history</span>{failedRunCount > 0 && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">{failedRunCount} failed</span>}
        </button>
      </div>}
    </div>
  );
}
