import React, { useEffect, useState } from 'react';
import type { OfficeReport } from '../../../office/types';
import { reportCsv, safePathPart } from '../../../office/report';
export function OfficeReportView({ report: initial, runId, stepRunId, running = false }: { report: OfficeReport; runId: string; stepRunId: string; running?: boolean }) {
  const [report, setReport] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'added' | 'changed' | 'unchanged'>('all');
  const [showHandled, setShowHandled] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { setReport(initial); }, [initial]);
  const archive = async (download = false) => {
    if (running) return;
    setBusy(true); setError('');
    try {
      const response = await chrome.runtime.sendMessage({ action: download ? 'officeArchiveDownload' : 'officeArchiveRefresh', runId, stepRunId, fileIds: selected });
      if (!response.success) throw new Error(response.error);
      setReport(response.data); if (download) setSelected([]);
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); } finally { setBusy(false); }
  };
  const markHandled = async (recordKey: string, handled: boolean) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'officeRecordHandled', runId, stepRunId, recordKey, handled });
      if (!response.success) throw new Error(response.error);
      setReport(response.data);
      setNotice(handled ? 'Marked handled. Unchanged records stay hidden on repeat runs; changed records return to your list.' : 'Returned to your follow-up list.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const exportCsv = async () => {
    const url = URL.createObjectURL(new Blob([reportCsv(report)], { type: 'text/csv;charset=utf-8' }));
    try { await chrome.downloads.download({ url, filename: `${safePathPart(report.config.name)}.csv`, saveAs: true }); }
    catch (cause) { setError(String(cause)); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
  };
  const comparison = report.comparison;
  const canHandle = report.config.mode === 'inspection' && report.config.keyColumn !== undefined;
  const handledKeys = new Set(report.handledKeys ?? []);
  const activeRows = report.rows.filter(row => !canHandle || showHandled || !handledKeys.has(row.key));
  const visibleRows = comparison && filter !== 'all' ? activeRows.filter(row => comparison[filter].includes(row.key)) : activeRows;
  const rowStatus = (key: string) => !comparison ? '' : comparison.added.includes(key) ? 'New' : comparison.changed.includes(key) ? 'Changed' : 'Continuing';
  const categoryCount = (category: 'added' | 'changed' | 'unchanged') => activeRows.filter(row => comparison?.[category].includes(row.key)).length;
  const filters = [ ['all', 'All matches', activeRows.length], ['added', 'New', categoryCount('added')], ['changed', 'Changed', categoryCount('changed')], ['unchanged', 'Continuing', categoryCount('unchanged')] ] as const;
  return <section aria-label="Office report" className="space-y-3 rounded-lg border border-stone-200 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold">{report.config.name}</h3><span className={`text-xs ${report.complete ? 'text-emerald-700' : 'text-amber-700'}`}>{running ? 'Reading…' : report.complete ? 'Complete' : 'Partial results'}</span></div>
    <p role="status" className="text-xs text-stone-600">{report.pages} pages · {report.scanned} rows inspected · {report.rows.length} matched</p>
    {canHandle && <div className="space-y-2"><label className="flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" checked={showHandled} onChange={e => setShowHandled(e.target.checked)} />Show handled records ({handledKeys.size})</label><p className="text-[11px] leading-5 text-stone-500">Mark a record after following up. This only updates your local list, not the source system. A changed record appears again.</p></div>}
    {notice && <p role="status" className="rounded-md bg-emerald-50 p-2 text-xs leading-5 text-emerald-800">{notice}</p>}
    {report.warnings.map(warning => <p key={warning} className="text-xs text-amber-800">{warning}</p>)}
    {running ? <p className="text-xs leading-5 text-stone-500">Results update as pages are read. Wait for completion before comparing or downloading.</p> : !report.complete ? <p className="rounded-md bg-amber-50 p-2 text-xs leading-5 text-amber-800">This is only part of the list. Check the page, login and limits, then run the saved task again from Automations. No records are marked resolved from a partial run.</p> : !comparison && <p className="rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-600">{report.config.keyColumn === undefined ? 'Choose a unique record ID in the saved task to compare repeat runs.' : 'This result is the comparison baseline. Run the same saved task again to see new, changed and continuing matches.'}</p>}
    {comparison && <><p className="text-xs leading-5 text-stone-600">Compared with {new Date(comparison.previousAt).toLocaleString()}. Continuing records still match your rule; no longer matching records need confirmation in the source system.</p><div className="flex flex-wrap gap-2" aria-label="Filter inspection results">{filters.map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-md border px-2 py-1.5 text-xs ${filter === value ? 'border-[#315a78] bg-[#315a78] text-white' : 'border-stone-300 text-stone-600'}`}>{label} ({count})</button>)}</div></>}
    <button disabled={running} onClick={exportCsv} className="text-xs font-semibold text-[#315a78] disabled:opacity-50">{report.complete ? 'Export all matching rows as CSV' : 'Export partial matching rows as CSV'}</button>
    <div className="max-h-80 overflow-auto" tabIndex={0} role="region" aria-label="Matching records, scroll horizontally for more columns">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-stone-100"><tr>{comparison && <th className="p-2">Change</th>}{report.config.headers.map((header, index) => <th key={index} className="p-2 whitespace-nowrap">{header}</th>)}<th className="sticky right-0 bg-stone-100 p-2">Source</th></tr></thead>
        <tbody>{visibleRows.map(row => <tr key={row.key} className="border-b border-stone-100">
          {comparison && <td className="p-2 whitespace-nowrap">{rowStatus(row.key)}</td>}
          {row.cells.map((cell, index) => <td key={index} className="p-2 min-w-24 max-w-48 break-words">{cell}</td>)}
          <td className="sticky right-0 bg-white p-2"><a href={row.detailUrl ?? row.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${row.detailUrl ? 'Open record' : 'Open list'} ${row.key}`} className="whitespace-nowrap text-[#315a78]">{row.detailUrl ? 'Open record' : 'Open list'}</a>{canHandle && <button type="button" disabled={running || busy} onClick={() => markHandled(row.key, !handledKeys.has(row.key))} aria-label={`${handledKeys.has(row.key) ? 'Undo handled' : 'Mark handled'} ${row.key}`} className="mt-2 block whitespace-nowrap text-[#315a78] disabled:opacity-50">{handledKeys.has(row.key) ? 'Undo handled' : 'Mark handled'}</button>}</td>
        </tr>)}</tbody>
      </table>
      {!visibleRows.length && <p className="p-2 text-xs text-stone-500">{running ? 'Waiting for matching rows…' : !report.complete ? 'No matches in the pages read so far. Unread pages may contain matches.' : canHandle && !showHandled && handledKeys.size === report.rows.length && report.rows.length ? 'All matching records are marked handled. Turn on Show handled records to review or undo.' : report.rows.length ? 'No records in this category. Choose All matches to see the full result.' : 'No rows matched your rule in the pages read.'}</p>}
    </div>
    {!!visibleRows.length && <p className="text-[11px] text-stone-500">Scroll the table sideways to see more columns. Record links stay visible.</p>}
    {!!comparison?.noLongerMatched.length && <details className="text-xs"><summary>No longer matching ({comparison.noLongerMatched.length})</summary><p className="mt-2 leading-5 text-stone-500">These records disappeared or stopped matching the rule. Open each record to check its current status.</p>{comparison.noLongerMatched.map(row => <p key={row.key} className="mt-2 break-words">{row.cells.join(' · ')} <a href={row.detailUrl ?? row.sourceUrl} target="_blank" rel="noreferrer" className="text-[#315a78]">Check source</a></p>)}</details>}
    {report.config.mode === 'archive' && <div className="space-y-2 border-t border-stone-200 pt-3"><div className="flex items-center justify-between"><h4 className="text-xs font-semibold">Files ({report.files.length})</h4><button disabled={busy} onClick={() => archive()} className="text-xs text-[#315a78]">Refresh status</button></div><p className="text-[11px] text-stone-500">Downloads / BrowserOnly / {safePathPart(report.config.name)} / {new Date(report.startedAt).toISOString().slice(0, 10)}</p>{!report.files.length && <p className="text-xs text-stone-500">No supported file links found in matching rows. Downloads generated by site buttons need a custom workflow.</p>}{report.files.map(file => <label key={file.id} className="flex items-start gap-2 border-b border-stone-100 py-2 text-xs"><input type="checkbox" disabled={busy || !['ready', 'failed'].includes(file.status)} checked={selected.includes(file.id)} onChange={e => setSelected(current => e.target.checked ? [...current, file.id] : current.filter(id => id !== file.id))} /><span className="min-w-0 flex-1 break-words"><a href={file.url} target="_blank" rel="noreferrer" className="text-[#315a78]">{file.name}</a><span className="mt-1 block text-stone-500">{file.status}{file.error ? `: ${file.error}` : ''}</span></span></label>)}<button disabled={busy || !selected.length} onClick={() => archive(true)} className="rounded-md bg-[#315a78] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Updating…' : `Download selected (${selected.length})`}</button></div>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </section>;
}
