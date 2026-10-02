import React, { useEffect, useState } from 'react';
import { WorkflowStore, createBlankWorkflow } from '../../../workflows';
import type { Workflow } from '../../../workflows';
import { discoverOfficeTables } from '../../../office/pageReader';
import { officeConfigSchema, type OfficeConfig, type OfficeTable } from '../../../office/types';

const inputClass = 'mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-xs';
export function OfficeCreateView({ mode, onBack, onCreated }: { mode: OfficeConfig['mode']; onBack: () => void; onCreated: (workflow: Workflow) => void }) {
  const [tables, setTables] = useState<OfficeTable[]>([]);
  const [tableIndex, setTableIndex] = useState(0);
  const [url, setUrl] = useState('');
  const [name, setName] = useState(mode === 'inspection' ? 'Daily inspection' : 'Document archive');
  const [keyColumn, setKeyColumn] = useState('');
  const [ruleColumn, setRuleColumn] = useState('');
  const [operator, setOperator] = useState<NonNullable<OfficeConfig['rule']>['operator']>('contains');
  const [value, setValue] = useState('');
  const [nextSelector, setNextSelector] = useState('');
  const [maxPages, setMaxPages] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const table = tables[tableIndex];
  const load = async () => {
    setBusy(true); setError('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error('Open the webpage containing your table first.');
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: discoverOfficeTables });
      const found = results[0]?.result ?? [];
      setTables(found); setTableIndex(0); setKeyColumn(''); setRuleColumn(''); setUrl(tab.url);
      if (!found.length) throw new Error('No visible table with column headers found. This version supports standard HTML tables.');
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); } finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (!table) return;
    setBusy(true); setError('');
    try {
      const config = officeConfigSchema.parse({ mode, name, tableSelector: table.selector, headers: table.headers, keyColumn: keyColumn === '' ? undefined : Number(keyColumn), rule: ruleColumn === '' ? undefined : { column: Number(ruleColumn), operator, value }, nextSelector, maxPages, maxRows: 1000 });
      const candidate = createBlankWorkflow(config.name);
      candidate.workflow.startUrl = url; candidate.workflow.executionMode = 'new_tab'; candidate.workflow.status = 'active';
      candidate.workflow.description = mode === 'inspection' ? 'Inspect table rows and compare results with the previous complete run.' : 'Collect document links for reviewed batch downloads.';
      candidate.version.steps = [{ id: 'office-inspection', type: 'action', label: mode === 'inspection' ? 'Inspect and summarize' : 'Collect archive files', enabled: true, timeoutMs: 240000, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onFailure: 'stop', toolName: 'browser_inspect_office_table', input: JSON.stringify(config), risk: 'read' }];
      const store = WorkflowStore.getInstance(); await store.saveVersion(candidate.version); await store.saveWorkflow(candidate.workflow); onCreated(candidate.workflow);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const columns = table?.headers.map((header, index) => <option key={index} value={index}>{header || `Column ${index + 1}`}</option>);
  return <div className="space-y-4">
    <button onClick={onBack} className="text-xs text-stone-500">← Automations</button>
    <h2 className="text-base font-semibold">{mode === 'inspection' ? 'Inspection & summary' : 'Download & archive'}</h2>
    <p className="text-xs leading-5 text-stone-600">Save the current table and filters. Each run opens the saved URL in a new tab. Set page filters in the URL before saving.</p>
    <label className="block text-xs">Task name<input className={inputClass} value={name} onChange={e => setName(e.target.value)} /></label>
    <button disabled={busy} onClick={load} className="text-xs font-semibold text-[#315a78]">Read current page again</button>
    {table && <>
      <label className="block text-xs">Table<select className={inputClass} value={tableIndex} onChange={e => { setTableIndex(Number(e.target.value)); setKeyColumn(''); setRuleColumn(''); }}>{tables.map((item, index) => <option key={item.selector} value={index}>{item.headers.join(' · ')}</option>)}</select></label>
      <div className="overflow-x-auto rounded-md border border-stone-200"><table className="w-full text-left text-[11px]"><thead className="bg-stone-100"><tr>{table.headers.map((header, index) => <th key={index} className="p-2 whitespace-nowrap">{header}</th>)}</tr></thead><tbody>{table.sample.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="max-w-48 break-words p-2">{cell}</td>)}</tr>)}</tbody></table></div>
      <label className="block text-xs">Unique record ID<select className={inputClass} value={keyColumn} onChange={e => setKeyColumn(e.target.value)}><option value="">No comparison between runs</option>{columns}</select></label>
      <label className="block text-xs">Include rows where<select className={inputClass} value={ruleColumn} onChange={e => setRuleColumn(e.target.value)}><option value="">All rows</option>{columns}</select></label>
      {ruleColumn !== '' && <><label className="block text-xs">Condition<select className={inputClass} value={operator} onChange={e => setOperator(e.target.value as typeof operator)}><option value="contains">Contains text</option><option value="equals">Equals text</option><option value="greater_than">Number greater than</option><option value="less_than">Number less than</option><option value="older_than_days">Date older than days</option></select></label><label className="block text-xs">Value<input className={inputClass} value={value} onChange={e => setValue(e.target.value)} /></label></>}
      <details className="text-xs"><summary className="cursor-pointer text-stone-600">Pagination</summary><label className="mt-2 block">Next-page button CSS selector<input className={inputClass} value={nextSelector} onChange={e => setNextSelector(e.target.value)} placeholder="button.next" /></label><label className="mt-2 block">Maximum pages<input type="number" min={1} max={20} className={inputClass} value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} /></label></details>
      {mode === 'archive' && <p className="rounded-md bg-stone-50 p-3 text-xs leading-5">Collects PDF, spreadsheet, document, ZIP and text links from matching rows. Review files before downloading into BrowserOnly / task / date in your Downloads folder.</p>}
    </>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <button disabled={busy || !table || !name.trim()} onClick={save} className="w-full rounded-md bg-[#315a78] p-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Working…' : 'Save automation'}</button>
  </div>;
}
