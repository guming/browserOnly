import React, { useState } from 'react';
import type { ExtractionResult } from '../../../extraction';
import { toCsv, toJson } from '../../../extraction';

export function ExtractionResultView({ result }: { result: ExtractionResult }) {
  const [format, setFormat] = useState<'table' | 'json'>('table');
  const download = (content: string, name: string, type: string) => { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
  return <section aria-label="Extraction result"><div><button type="button" onClick={() => setFormat('table')}>Table</button><button type="button" onClick={() => setFormat('json')}>JSON</button><button type="button" onClick={() => download(toCsv(result), 'extraction.csv', 'text/csv')}>Download CSV</button><button type="button" onClick={() => download(toJson(result), 'extraction.json', 'application/json')}>Download JSON</button></div>
    {format === 'json' ? <pre>{toJson(result)}</pre> : <div role="region" aria-label="Extracted table" style={{ overflowX: 'auto' }}><table><thead><tr>{result.fields.map(f => <th key={f.key}>{f.label}</th>)}</tr></thead><tbody>{result.rows.map((row, i) => <tr key={i}>{result.fields.map(f => <td key={f.key}>{row[f.key] == null ? '' : String(row[f.key])}</td>)}</tr>)}</tbody></table></div>}
    {result.warnings.length > 0 && <ul aria-label="Extraction warnings">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
  </section>;
}
