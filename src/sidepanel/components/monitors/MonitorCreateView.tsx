import React, { useState } from 'react';

const DEFAULT_INSTRUCTION = 'Monitor the main content of this page and notify me when it changes.';

export function MonitorCreateView({ tabId, onCreated, onCancel }: { tabId?: number; onCreated: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(''); const [url, setUrl] = useState('');
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  const create = async () => {
    setBusy(true); setError('');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'monitorCreate', monitor: { name: name.trim(), url: url.trim(), instruction: instruction.trim() } });
      if (!response.success) throw new Error(response.error.message); onCreated(response.data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const valid = name.trim() && /^https?:\/\//.test(url.trim()) && instruction.trim();
  return <div className="space-y-4">
    <div className="flex items-center gap-2"><button onClick={onCancel} className="text-sm text-stone-500">←</button><h2 className="text-base font-semibold">New monitor</h2></div>
    <label className="block text-xs font-medium">Name<input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
    <label className="block text-xs font-medium">URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
    <label className="block text-xs font-medium">What should I monitor?<textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={5} placeholder="For example: Notify me if the product price drops below $50, or if it becomes unavailable." className="mt-1 w-full resize-y rounded-md border border-stone-300 px-3 py-2 text-sm leading-5" /><span className="mt-1 block font-normal text-stone-500">Describe what to watch and what change should trigger a notification.</span></label>
    <p className="rounded-md bg-amber-50 p-2 text-[11px] leading-4 text-amber-800">Monitoring runs locally on a best-effort schedule. Chrome and this computer must remain running.</p>
    {error && <p className="text-xs text-red-600">{error}</p>}
    <button disabled={!valid || busy} onClick={create} className="w-full rounded-md bg-[#315a78] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Creating monitor…' : 'Create monitor'}</button>
  </div>;
}
