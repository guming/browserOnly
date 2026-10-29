import React, { useEffect, useState } from 'react';
import type { ElementSelection } from '../../../monitoring/types';

const DEFAULT_INSTRUCTION = 'Notify me when the selected value changes.';

export function MonitorCreateView({ tabId, onCreated, onCancel }: { tabId?: number; onCreated: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(''); const [url, setUrl] = useState('');
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [scope, setScope] = useState<'text' | 'page_text'>('text');
  const [selection, setSelection] = useState<ElementSelection>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    if (tabId === undefined) return;
    chrome.tabs.get(tabId).then(tab => {
      if (tab.url?.startsWith('http')) setUrl(current => current || tab.url || '');
    }).catch(() => undefined);
  }, [tabId]);

  const pick = async () => {
    if (tabId === undefined) { setError('Open the page you want to monitor first.'); return; }
    setError('');
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url?.startsWith('http')) throw new Error('Open the page you want to monitor first.');
      const response = await chrome.runtime.sendMessage({ action: 'monitorPickElement', tabId });
      if (!response.success) throw new Error(response.error.message);
      setSelection(response.data);
      setUrl(tab.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const create = async () => {
    setBusy(true); setError('');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'monitorCreate', monitor: { name: name.trim(), url: url.trim(), instruction: instruction.trim(), kind: scope, locator: scope === 'text' ? selection?.locator : undefined } });
      if (!response.success) throw new Error(response.error.message); onCreated(response.data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const valid = name.trim() && /^https?:\/\//.test(url.trim()) && instruction.trim();
  return <div className="space-y-4">
    <div className="flex items-center gap-2"><button onClick={onCancel} className="text-sm text-stone-500">←</button><h2 className="text-base font-semibold">New monitor</h2></div>
    <label className="block text-xs font-medium">Name<input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
    <label className="block text-xs font-medium">URL<input value={url} onChange={e => { setUrl(e.target.value); setSelection(undefined); }} placeholder="https://example.com" className="mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm" /></label>
    <fieldset className="space-y-2 text-xs"><legend className="font-medium">Watch</legend>
      <label className="flex items-center gap-2"><input type="radio" checked={scope === 'text'} onChange={() => setScope('text')} />One selected value</label>
      <label className="flex items-center gap-2"><input type="radio" checked={scope === 'page_text'} onChange={() => setScope('page_text')} />Whole page text</label>
    </fieldset>
    {scope === 'text' && <div><button type="button" onClick={() => void pick()} className="rounded border border-[#315a78] px-3 py-1 text-xs font-semibold text-[#315a78]">Select value on current page</button><p className="mt-1 text-xs text-stone-500">{selection ? `Selected: ${selection.sample.slice(0, 120) || selection.tagName}` : 'The first run finds the target from your description and saves its location. You can also select it yourself.'}</p></div>}
    <label className="block text-xs font-medium">What should I monitor?<textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={3} className="mt-1 w-full resize-y rounded border border-stone-300 px-3 py-2 text-sm leading-5" /><span className="mt-1 block font-normal text-stone-500">Describe the exact value. Later checks read its saved location.</span></label>
    <p className="rounded-md bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">Monitoring runs locally on a best-effort schedule. Chrome and this computer must remain running.</p>
    {error && <p className="text-xs text-red-600">{error}</p>}
    <button disabled={!valid || busy} onClick={create} className="w-full rounded-md bg-[#315a78] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Creating monitor…' : 'Create monitor'}</button>
  </div>;
}
