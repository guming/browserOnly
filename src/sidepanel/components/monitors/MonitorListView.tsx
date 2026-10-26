import React, { useEffect, useState } from 'react';
import type { Monitor } from '../../../monitoring';
import { MonitorCreateView } from './MonitorCreateView';
import { MonitorDetailView } from './MonitorDetailView';

export function MonitorListView({ tabId }: { tabId?: number }) {
  const [monitors, setMonitors] = useState<Array<Monitor & { isRunning?: boolean }>>([]); const [mode, setMode] = useState<'list' | 'create'>('list'); const [selected, setSelected] = useState<string>();
  const [startingRuns, setStartingRuns] = useState<Set<string>>(new Set());
  const load = () => chrome.runtime.sendMessage({ action: 'monitorList' }).then(response => { if (response.success) setMonitors(response.data); });
  useEffect(() => { load(); const listener = (message: any) => { if (message.action === 'monitorRunUpdated') load(); }; chrome.runtime.onMessage.addListener(listener); return () => chrome.runtime.onMessage.removeListener(listener); }, []);
  if (selected) return <MonitorDetailView monitorId={selected} onBack={() => { setSelected(undefined); load(); }} />;
  if (mode === 'create') return <MonitorCreateView tabId={tabId} onCancel={() => setMode('list')} onCreated={id => { setMode('list'); setSelected(id); load(); }} />;
  const action = async (name: string, id: string) => { await chrome.runtime.sendMessage({ action: name, monitorId: id }); load(); };
  const runNow = async (id: string) => {
    setStartingRuns(current => new Set(current).add(id));
    try { await chrome.runtime.sendMessage({ action: 'monitorRunNow', monitorId: id }); }
    finally { await load(); }
  };
  return <div className="space-y-3"><div className="flex items-start justify-between"><div><h2 className="text-base font-semibold">Monitors</h2><p className="mt-1 text-xs text-stone-500">Describe what you want to watch on a page.</p></div><button onClick={() => setMode('create')} className="rounded-md bg-[#315a78] px-3 py-2 text-xs font-semibold text-white">+ New</button></div>
    {!monitors.length ? <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 text-xs text-stone-600">No monitors yet. Create one from the current webpage.</div> : monitors.map(monitor => {
      const executing = !!monitor.isRunning || startingRuns.has(monitor.id);
      const scheduled = monitor.status === 'active';
      const statusLabel = executing ? 'Executing…' : monitor.status === 'needs_attention' ? 'Needs attention' : scheduled ? 'Running' : 'Paused';
      return <div key={monitor.id} className="rounded-xl border border-stone-200 bg-white p-3">
        <button onClick={() => setSelected(monitor.id)} className="w-full text-left">
          <div className="flex justify-between gap-2"><span className="truncate text-sm font-semibold">{monitor.name}</span>
            <span className={`inline-flex items-center gap-1.5 text-[11px] ${executing ? 'font-semibold text-[#315a78]' : monitor.status === 'needs_attention' ? 'text-red-600' : scheduled ? 'text-emerald-700' : 'text-stone-500'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${executing ? 'animate-pulse bg-[#4d8aad]' : monitor.status === 'needs_attention' ? 'bg-red-500' : scheduled ? 'bg-emerald-500' : 'bg-stone-400'}`} aria-hidden="true" />
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-stone-500">Every {monitor.scheduleMinutes} min · {new URL(monitor.url).hostname}</p>
          {monitor.instruction && <p className="mt-1 line-clamp-2 text-xs text-stone-600">{monitor.instruction}</p>}
        </button>
        <div className="mt-3 flex gap-3 border-t border-stone-100 pt-2 text-[11px]">
          <button disabled={executing} onClick={() => void runNow(monitor.id)} className="disabled:cursor-wait disabled:text-stone-400">{executing ? 'Executing…' : 'Run now'}</button>
          <button disabled={executing} onClick={() => action(scheduled ? 'monitorPause' : 'monitorResume', monitor.id)} className="disabled:text-stone-400">{scheduled ? 'Pause' : 'Resume'}</button>
          <button className="ml-auto text-red-600" onClick={() => { if (confirm('Delete this monitor and all of its history?')) action('monitorDelete', monitor.id); }}>Delete</button>
        </div>
      </div>;
    })}
  </div>;
}
