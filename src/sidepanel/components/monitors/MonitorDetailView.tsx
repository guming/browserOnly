import React, { useEffect, useState } from 'react';
import type { Monitor, MonitorDiff, MonitorRun, MonitorSnapshot } from '../../../monitoring';
import { localizedChange } from '../../../monitoring/DiffEngine';
import { valueText } from '../../../monitoring/normalizers';

type Detail = { monitor: Monitor; runs: MonitorRun[]; snapshots: MonitorSnapshot[]; diffs: MonitorDiff[] };

const displayValue = (value: MonitorSnapshot['normalizedValue'] | MonitorDiff['currentValue'] | undefined) =>
  value?.type === 'text' ? value.text
    : value?.type === 'price' ? `${value.currency ? `${value.currency} ` : ''}${value.amount}`
      : value?.type === 'stock' ? value.state.replaceAll('_', ' ') : 'No successful baseline';

export function MonitorDetailView({ monitorId, tabId, onBack }: { monitorId: string; tabId?: number; onBack: () => void }) {
  const [data, setData] = useState<Detail>();
  const [targetError, setTargetError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const load = () => chrome.runtime.sendMessage({ action: 'monitorGet', monitorId }).then(response => {
    if (response.success) setData(response.data);
  });

  useEffect(() => {
    load();
    const listener = (message: { action?: string; monitorId?: string }) => {
      if (message.action === 'monitorRunUpdated' && message.monitorId === monitorId) load();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [monitorId]);

  if (!data) return <p className="text-xs text-stone-500">Loading…</p>;
  const current = data.snapshots[0];
  const findFromDescription = async () => {
    setTargetError(''); setSelecting(true);
    try {
      const updated = await chrome.runtime.sendMessage({ action: 'monitorUpdateTarget', monitorId });
      if (!updated.success) throw new Error(updated.error.message);
      await load();
    } catch (cause) { setTargetError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSelecting(false); }
  };
  const changeTarget = async () => {
    if (tabId === undefined) { setTargetError('Open the monitored page first.'); return; }
    setTargetError(''); setSelecting(true);
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || new URL(tab.url).origin + new URL(tab.url).pathname !== new URL(data.monitor.url).origin + new URL(data.monitor.url).pathname) throw new Error('Open the monitored page in the current tab first.');
      const picked = await chrome.runtime.sendMessage({ action: 'monitorPickElement', tabId });
      if (!picked.success) throw new Error(picked.error.message);
      const updated = await chrome.runtime.sendMessage({ action: 'monitorUpdateTarget', monitorId, locator: picked.data.locator });
      if (!updated.success) throw new Error(updated.error.message);
      await load();
    } catch (cause) { setTargetError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSelecting(false); }
  };
  const openComparison = (diffId: string) => {
    const query = new URLSearchParams({ monitorId, diffId });
    chrome.tabs.create({ url: chrome.runtime.getURL(`monitor-compare.html?${query}`), active: true });
  };

  return <div className="space-y-4">
    <div className="flex items-center justify-between">
      <button onClick={onBack} className="text-sm text-stone-500">← Monitors</button>
      <button onClick={() => chrome.runtime.sendMessage({ action: data.monitor.status === 'active' ? 'monitorPause' : 'monitorResume', monitorId }).then(load)} className="text-xs font-semibold text-[#315a78]">
        {data.monitor.status === 'active' ? 'Pause' : 'Resume'}
      </button>
    </div>
    <div>
      <h2 className="text-base font-semibold text-stone-900">{data.monitor.name}</h2>
      <p className="mt-1 truncate text-xs text-stone-500">{data.monitor.url}</p>
      {data.monitor.instruction && <p className="mt-2 whitespace-pre-wrap text-xs text-stone-600">{data.monitor.instruction}</p>}
      <p className="mt-1 text-xs text-stone-500">Watching: {data.monitor.kind === 'page_text' ? 'whole page text' : 'selected value'}</p>
      <div className="mt-2 flex gap-3"><button type="button" disabled={selecting} onClick={() => void findFromDescription()} className="text-xs font-semibold text-[#315a78] disabled:opacity-50">Find target from description</button><button type="button" disabled={selecting} onClick={() => void changeTarget()} className="text-xs font-semibold text-[#315a78] disabled:opacity-50">Select on page</button></div>
      {targetError && <p className="mt-1 text-xs text-red-600">{targetError}</p>}
    </div>
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
      <p className="text-[11px] uppercase text-stone-500">Current value</p>
      <p className="mt-1 break-words text-sm font-semibold">{displayValue(current?.normalizedValue)}</p>
      <p className="mt-2 text-[11px] text-stone-500">{data.monitor.lastCheckedAt ? `Last checked ${new Date(data.monitor.lastCheckedAt).toLocaleString()}` : 'Not checked'}</p>
    </div>
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase text-stone-500">History</h3>
      <div className="space-y-2">
        {data.runs.map(run => {
          const diff = data.diffs.find(item => item.id === run.diffId);
          const snapshot = data.snapshots.find(item => item.id === run.snapshotId);
          const pageText = snapshot?.kind === 'page_text';
          const local = pageText && diff?.changed ? localizedChange(valueText(diff.previousValue), valueText(diff.currentValue)) : undefined;
          const added = local?.added ?? diff?.addedText;
          const removed = local?.removed ?? diff?.removedText;
          return <div key={run.id} className="rounded-lg border border-stone-200 p-3 text-xs">
            <div className="flex justify-between"><span className="font-medium">{run.source === 'creation' ? 'Baseline' : run.status}</span><span className="text-stone-400">{new Date(run.startedAt).toLocaleString()}</span></div>
            {run.status === 'failed' && <p className="mt-1 text-red-600">{run.errorCode}: {run.errorMessage}</p>}
            {diff?.changed && <>
              {!pageText && <p className="mt-1 break-words text-stone-600">{displayValue(diff.previousValue)} → {displayValue(diff.currentValue)}{typeof diff.numericDelta === 'number' ? ` (${diff.numericDelta > 0 ? '+' : ''}${diff.numericDelta}${typeof diff.percentDelta === 'number' ? `, ${diff.percentDelta.toFixed(1)}%` : ''})` : ''}</p>}
              {added?.length ? <p className="mt-1 break-words text-green-700">Added: {added.join(' ')}</p> : null}
              {removed?.length ? <p className="mt-1 break-words text-red-700">Removed: {removed.join(' ')}</p> : null}
              <button type="button" onClick={() => openComparison(diff.id)} className="mt-2 font-semibold text-[#315a78] hover:underline">查看对比 ↗</button>
            </>}
          </div>;
        })}
        {!data.runs.length && <p className="text-xs text-stone-500">No runs yet.</p>}
      </div>
    </div>
  </div>;
}
