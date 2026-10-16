import React, { useState } from 'react';
import type { ExtractionResult } from '../../../extraction';
import { toCsv, toJson } from '../../../extraction';
import { createExtractionWorkflow } from '../../../extraction';
import type { ExtractionRequest } from '../../../extraction';
import { WorkflowStore } from '../../../workflows/WorkflowStore';

export function ExtractionResultView({ result, request, onSaveWorkflow }: { result: ExtractionResult; request?: ExtractionRequest; onSaveWorkflow?: (workflowId?: string) => void }) {
  const [format, setFormat] = useState<'table' | 'json'>('table');
  const download = (content: string, name: string, type: string) => { const url = URL.createObjectURL(new Blob([content], { type })); chrome.downloads.download({ url, filename: name, saveAs: true }).finally(() => URL.revokeObjectURL(url)); };
  const save = async () => { if (!request) return onSaveWorkflow?.(); const candidate = createExtractionWorkflow(request); const store = WorkflowStore.getInstance(); await store.saveVersion(candidate.version); await store.saveWorkflow(candidate.workflow); onSaveWorkflow?.(candidate.workflow.id); };
  return <section aria-label="Extraction result" className="space-y-3 rounded-lg border border-stone-200 bg-white p-3 text-xs"><div className="flex flex-wrap gap-2"><button className="min-h-9 rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold text-[#315a78]" type="button" onClick={() => setFormat('table')}>Table</button><button className="min-h-9 rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold text-[#315a78]" type="button" onClick={() => setFormat('json')}>JSON</button><button className="min-h-9 rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold text-[#315a78]" type="button" onClick={() => navigator.clipboard.writeText(format === 'json' ? toJson(result) : toCsv(result))}>Copy</button><button className="min-h-9 rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold text-[#315a78]" type="button" onClick={() => download(toCsv(result), 'extraction.csv', 'text/csv')}>Download CSV</button><button className="min-h-9 rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold text-[#315a78]" type="button" onClick={() => download(toJson(result), 'extraction.json', 'application/json')}>Download JSON</button>{(request || onSaveWorkflow) && <button className="min-h-9 rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold text-[#315a78]" type="button" onClick={() => void save()}>Save as workflow</button>}</div>
    {format === 'json' ? <pre className="max-h-80 overflow-auto rounded-md bg-stone-50 p-3 text-xs">{toJson(result)}</pre> : <div role="region" aria-label="Extracted table" style={{ overflowX: 'auto' }}><table className="w-full border-collapse text-left text-xs"><thead><tr>{result.fields.map(f => <th className="border-b border-stone-200 bg-stone-50 p-2" key={f.key}>{f.label}</th>)}</tr></thead><tbody>{result.rows.map((row, i) => <tr key={i}>{result.fields.map(f => {
      const value = row[f.key];
      const url = f.type === 'url' && typeof value === 'string' && /^https?:\/\//.test(value) ? value : undefined;
      return <td className="min-w-24 border-b border-stone-100 p-2 first:sticky first:left-0 first:bg-white" key={f.key}>{url ? <a className="text-[#315a78] underline" href={url} target="_blank" rel="noreferrer">Open link</a> : value == null ? '' : String(value)}</td>;
    })}</tr>)}</tbody></table></div>}
    {result.pagesRead && <p>{result.pagesRead} pages read · {result.rows.length} records{result.partial ? " · Partial results" : ""}</p>}
    {typeof result.completeness === 'number' && <p>{Math.round(result.completeness * 100)}% required fields complete{result.partial ? ' · partial result' : ''}</p>}
    {result.warnings.length > 0 && <ul aria-label="Extraction warnings">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
  </section>;
}
