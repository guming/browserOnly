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
  return <section aria-label="Extraction result"><div><button type="button" onClick={() => setFormat('table')}>Table</button><button type="button" onClick={() => setFormat('json')}>JSON</button><button type="button" onClick={() => navigator.clipboard.writeText(format === 'json' ? toJson(result) : toCsv(result))}>Copy</button><button type="button" onClick={() => download(toCsv(result), 'extraction.csv', 'text/csv')}>Download CSV</button><button type="button" onClick={() => download(toJson(result), 'extraction.json', 'application/json')}>Download JSON</button>{(request || onSaveWorkflow) && <button type="button" onClick={() => void save()}>Save as workflow</button>}</div>
    {format === 'json' ? <pre>{toJson(result)}</pre> : <div role="region" aria-label="Extracted table" style={{ overflowX: 'auto' }}><table><thead><tr>{result.fields.map(f => <th key={f.key}>{f.label}</th>)}</tr></thead><tbody>{result.rows.map((row, i) => <tr key={i}>{result.fields.map(f => <td key={f.key}>{row[f.key] == null ? '' : String(row[f.key])}</td>)}</tr>)}</tbody></table></div>}
    {typeof result.completeness === 'number' && <p>{Math.round(result.completeness * 100)}% required fields complete{result.partial ? ' · partial result' : ''}</p>}
    {result.warnings.length > 0 && <ul aria-label="Extraction warnings">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
  </section>;
}
