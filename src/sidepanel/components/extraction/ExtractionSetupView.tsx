import React, { useMemo, useState } from 'react';
import type { ExtractionField, ExtractionRequest } from '../../../extraction';
import { ExtractionFieldEditor } from './ExtractionFieldEditor';
import { StructuredExtractionService } from '../../../extraction';
import { discoverOfficeTables } from '../../../office/pageReader';
import type { OfficeTable } from '../../../office/types';
import { discoverPaginationControls } from '../../../extraction/pageDiscovery';

const input = 'mt-1 block w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 py-2 text-xs focus:border-[#315a78] focus:outline-none focus:ring-2 focus:ring-[#315a78]/15';
const button = 'min-h-9 rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold text-[#315a78] disabled:opacity-50';
interface Props { initialFields?: ExtractionField[]; onRun: (request: ExtractionRequest) => void; }
export function ExtractionSetupView({ initialFields = [], onRun }: Props) {
  const [fields, setFields] = useState(initialFields);
  const [source, setSource] = useState<ExtractionRequest['source']>('page');
  const [description, setDescription] = useState('');
  const [outputFormat, setOutputFormat] = useState<NonNullable<ExtractionRequest['outputFormat']>>('table');
  const [collections, setCollections] = useState<OfficeTable[]>([]);
  const [selected, setSelected] = useState(0);
  const [controls, setControls] = useState<Array<{ selector: string; label: string }>>([]);
  const [nextSelector, setNextSelector] = useState('');
  const [pages, setPages] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canRun = useMemo(() => fields.length > 0 && fields.every(f => /^[A-Za-z][A-Za-z0-9_]*$/.test(f.key) && f.label.trim()) && new Set(fields.map(f => f.key)).size === fields.length, [fields]);
  const discover = async () => {
    setBusy(true); setError('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) throw new Error('Open a readable webpage first.');
      const records = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: discoverOfficeTables });
      const pagination = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: discoverPaginationControls });
      setCollections(records[0]?.result ?? []); setSelected(0);
      setControls(pagination[0]?.result ?? []); setNextSelector('');
      if (!records[0]?.result?.length) throw new Error('No repeated records found. Try another page.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const collection = collections[selected];
  return <section aria-label="Structured extraction setup" className="space-y-4 text-stone-800">
    <div><h2 className="text-sm font-semibold">Extract structured data</h2><p className="mt-1 text-xs leading-5 text-stone-500">Choose fields, preview records, then collect your data.</p></div>
    <label className="block text-xs font-medium">Source<select className={input} value={source} onChange={e => { setSource(e.target.value as ExtractionRequest['source']); setPages(1); }}><option value="page">Current page</option><option value="selection">Selected text</option><option value="tabs">Multiple tabs</option></select></label>
    <label className="block text-xs font-medium">Describe what you need<textarea className={input} rows={3} aria-label="Describe fields" placeholder="Job title, location, job ID…" value={description} onChange={event => setDescription(event.target.value)} /></label>
    <button className={button} type="button" disabled={!description.trim()} onClick={() => setFields(new StructuredExtractionService().suggestFields(description))}>Suggest fields</button>
    <ExtractionFieldEditor fields={fields} onChange={setFields} />
    {source === 'page' && <div className="space-y-3 rounded-md bg-stone-50 p-3">
      <button className={button} type="button" disabled={busy} onClick={() => void discover()}>{busy ? 'Discovering…' : 'Discover records & pagination'}</button>
      {collection && <><label className="block text-xs">Records<select className={input} value={selected} onChange={e => setSelected(Number(e.target.value))}>{collections.map((item, index) => <option key={item.selector} value={index}>{item.sourceKind} · {item.recordCount} records</option>)}</select></label><div className="max-h-36 overflow-auto text-xs leading-5">{collection.sample.map((row, index) => <p className="border-b border-stone-200 py-2" key={index}>{row.join(' · ')}</p>)}</div></>}
      <label className="block text-xs">Pages to read<select className={input} value={pages === 1 ? 'current' : 'multiple'} onChange={e => setPages(e.target.value === 'current' ? 1 : 5)}><option value="current">Current page</option><option value="multiple">From current page onwards</option></select></label>
      {pages > 1 && <><label className="block text-xs">Maximum pages<input className={input} type="number" min={2} max={20} value={pages} onChange={e => setPages(Math.min(20, Math.max(2, Number(e.target.value))))} /></label><label className="block text-xs">Next-page control<select className={input} value={nextSelector} onChange={e => setNextSelector(e.target.value)}><option value="">Choose the next-page button</option>{controls.map(control => <option key={control.selector} value={control.selector}>{control.label}</option>)}</select></label><p className="text-xs leading-5 text-stone-500">Start on page 1 to collect the first {pages} pages. Pagination uses this tab to preserve your filters. Maximum 100 records in total.</p></>}
    </div>}
    <label className="block text-xs font-medium">Output<select className={input} value={outputFormat} onChange={event => setOutputFormat(event.target.value as NonNullable<ExtractionRequest['outputFormat']>)}><option value="table">Table</option><option value="csv">CSV</option><option value="json">JSON</option></select></label>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <button className="min-h-10 w-full rounded-md bg-[#315a78] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" type="button" disabled={!canRun || busy || pages > 1 && (!collection || !nextSelector)} onClick={() => onRun({ source, fields, outputFormat, maxRows: 100, ...(collection && source === 'page' ? { plan: { version: 1, sourceKind: collection.sourceKind, listSelector: collection.selector, itemSelector: collection.sourceKind === 'table' ? `${collection.selector} tbody tr` : collection.selector, fields: fields.map((field, index) => ({ name: field.key, column: index, required: field.required })), nextSelector: pages > 1 ? nextSelector : undefined, maxPages: pages, maxRows: 100 } } : {}) })}>Confirm & extract{pages > 1 ? ` ${pages} pages` : ''}</button>
  </section>;
}
