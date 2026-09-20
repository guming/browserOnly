import React, { useState } from 'react';
import type { ElementSelection, MonitorKind, MonitorTrigger } from '../../../monitoring';

export function MonitorCreateView({ tabId, onCreated, onCancel }: { tabId?: number; onCreated: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(''); const [url, setUrl] = useState('');
  const [kind, setKind] = useState<Extract<MonitorKind, 'text' | 'price' | 'stock' | 'page_text'>>('text');
  const [selection, setSelection] = useState<ElementSelection>(); const [interval, setIntervalValue] = useState(30);
  const [triggerType, setTriggerType] = useState<MonitorTrigger['type']>('changed');
  const [keyword, setKeyword] = useState(''); const [waitForText, setWaitForText] = useState('');
  const [threshold, setThreshold] = useState(''); const [currency, setCurrency] = useState('');
  const [stockIndicatorMeans, setStockIndicatorMeans] = useState<'in_stock' | 'out_of_stock'>('out_of_stock');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  const pick = async () => {
    if (!tabId) return setError('No active webpage is available.');
    setBusy(true); setError('');
    try {
      const tab = await chrome.tabs.get(tabId); setUrl(tab.url ?? ''); if (!name) setName(tab.title ?? 'Page monitor');
      const response = await chrome.runtime.sendMessage({ action: 'monitorPickElement', tabId });
      if (!response.success) throw new Error(response.error.message); setSelection(response.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const create = async () => {
    if (!selection && kind !== 'page_text') return; setBusy(true); setError('');
    const trigger: MonitorTrigger = triggerType === 'changed' ? { type: 'changed' }
      : triggerType === 'text_appears' || triggerType === 'text_disappears' ? { type: triggerType, text: keyword, caseSensitive: false }
      : triggerType === 'price_below' || triggerType === 'price_above' ? { type: triggerType, amount: Number(threshold), currency: currency.trim().toUpperCase() || undefined }
      : { type: triggerType } as MonitorTrigger;
    try {
      const response = await chrome.runtime.sendMessage({ action: 'monitorCreate', monitor: { name: name.trim(), url, kind, locator: selection?.locator, scheduleMinutes: interval, trigger, normalization: kind === 'stock' ? { stockIndicatorMeans } : {}, readiness: { waitForText: waitForText.trim() || undefined } } });
      if (!response.success) throw new Error(response.error.message); onCreated(response.data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const keywordValid = triggerType !== 'text_appears' && triggerType !== 'text_disappears' || keyword.trim();
  const thresholdValid = triggerType !== 'price_below' && triggerType !== 'price_above' || Number.isFinite(Number(threshold)) && threshold.trim() !== '';
  const valid = name.trim() && /^https?:\/\//.test(url) && (selection || kind === 'page_text') && interval >= 1 && interval <= 43200 && keywordValid && thresholdValid;
  return <div className="space-y-4">
    <div className="flex items-center gap-2"><button onClick={onCancel} className="text-sm text-stone-500">←</button><h2 className="text-base font-semibold">New monitor</h2></div>
    <label className="block text-xs font-medium">Name<input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
    <label className="block text-xs font-medium">URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
    <label className="block text-xs font-medium">Type<select value={kind} onChange={e => { const next = e.target.value as typeof kind; setKind(next); setTriggerType(next === 'price' ? 'price_decreases' : next === 'stock' ? 'back_in_stock' : 'changed'); }} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"><option value="text">Text</option><option value="price">Price</option><option value="stock">Stock</option><option value="page_text">Page text</option></select></label>
    {kind !== 'page_text' ? <div className="rounded-lg border border-stone-200 p-3"><button disabled={busy} onClick={pick} className="rounded-md bg-[#315a78] px-3 py-2 text-xs font-semibold text-white">{selection ? 'Pick again' : 'Pick element'}</button>{selection && <p className="mt-2 break-words text-xs text-stone-600">Current sample: {selection.sample || '(empty)'}</p>}</div> : <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">BrowserOnly will monitor the main readable content of this page.</p>}
    <label className="block text-xs font-medium">Trigger<select value={triggerType} onChange={e => setTriggerType(e.target.value as MonitorTrigger['type'])} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">{(kind === 'text' || kind === 'page_text') && <><option value="changed">Text changes</option><option value="text_appears">Text appears</option><option value="text_disappears">Text disappears</option></>}{kind === 'price' && <><option value="changed">Price changes</option><option value="price_decreases">Price decreases</option><option value="price_increases">Price increases</option><option value="price_below">Price below</option><option value="price_above">Price above</option></>}{kind === 'stock' && <><option value="changed">Stock changes</option><option value="back_in_stock">Back in stock</option><option value="out_of_stock">Out of stock</option></>}</select></label>
    {(triggerType === 'text_appears' || triggerType === 'text_disappears') && <label className="block text-xs font-medium">Text<input value={keyword} onChange={e => setKeyword(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" /></label>}
    {(triggerType === 'price_below' || triggerType === 'price_above') && <div className="grid grid-cols-3 gap-2"><label className="col-span-2 block text-xs font-medium">Amount<input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" /></label><label className="block text-xs font-medium">Currency<input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="USD" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" /></label></div>}
    {kind === 'stock' && <label className="block text-xs font-medium">Selected element means<select value={stockIndicatorMeans} onChange={e => setStockIndicatorMeans(e.target.value as typeof stockIndicatorMeans)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"><option value="out_of_stock">Out of stock</option><option value="in_stock">In stock</option></select></label>}
    <label className="block text-xs font-medium">Check every (minutes)<input type="number" min={1} max={43200} value={interval} onChange={e => setIntervalValue(Number(e.target.value))} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" /></label>
    <label className="block text-xs font-medium">Wait for text (optional)<input value={waitForText} onChange={e => setWaitForText(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" /></label>
    <p className="rounded-md bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">Monitoring runs locally on a best-effort schedule. Chrome and this computer must remain running.</p>
    {error && <p className="text-xs text-red-600">{error}</p>}
    <button disabled={!valid || busy} onClick={create} className="w-full rounded-md bg-[#315a78] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Checking baseline…' : 'Create monitor'}</button>
  </div>;
}
