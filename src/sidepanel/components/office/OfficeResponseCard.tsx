import React from 'react';
import type { OfficeReport } from '../../../office/types';

export interface ParsedOfficeResponse {
  report: OfficeReport;
  raw: string;
  start: number;
  end: number;
}

function extractJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}

export function parseOfficeReportResponse(text: string): ParsedOfficeResponse | null {
  const start = text.indexOf('{"kind":"office-report"');
  if (start < 0) return null;
  const raw = extractJsonObject(text, start);
  if (!raw) return null;
  try {
    const report = JSON.parse(raw) as OfficeReport;
    if (report.kind !== 'office-report' || !report.config || !Array.isArray(report.rows)) return null;
    return { report, raw, start, end: start + raw.length };
  } catch {
    return null;
  }
}

export function OfficeResponseCard({ report, rawJson }: { report: OfficeReport; rawJson: string }) {
  const comparison = report.comparison;
  const statusFor = (key: string) => comparison?.added.includes(key) ? 'New' : comparison?.changed.includes(key) ? 'Changed' : comparison?.unchanged.includes(key) ? 'Continuing' : '';
  return <section aria-label="Inspection result" className="my-2 space-y-2 rounded-lg border border-stone-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{report.config.name}</h3>
      <span className={`text-xs ${report.complete ? 'text-emerald-700' : 'text-amber-700'}`}>{report.complete ? 'Complete' : 'Partial results'}</span>
    </div>
    <p className="text-xs text-stone-600">{report.pages} pages · {report.scanned} rows inspected · {report.rows.length} need attention</p>
    {comparison && <div className="flex flex-wrap gap-2 text-[11px] text-stone-600"><span>New {comparison.added.length}</span><span>Changed {comparison.changed.length}</span><span>Continuing {comparison.unchanged.length}</span><span>No longer matching {comparison.noLongerMatched.length}</span></div>}
    {report.warnings.map(warning => <p key={warning} className="rounded bg-amber-50 p-2 text-xs text-amber-800">{warning}</p>)}
    {report.rows.length ? <ul className="space-y-1.5">{report.rows.map(row => <li key={row.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-stone-100 py-1.5 text-xs"><span className="font-medium">{row.key}</span>{statusFor(row.key) && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{statusFor(row.key)}</span>}<span className="min-w-0 flex-1 break-words text-stone-600">{row.cells.filter((_, index) => index !== report.config.detailLinkColumn).join(' · ')}</span><a href={row.detailUrl ?? row.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${row.detailUrl ? 'Open record' : 'Open list'} ${row.key}`} className="whitespace-nowrap font-medium text-[#315a78] underline">{row.detailUrl ? '打开工单' : '打开列表'}</a></li>)}</ul> : <p className="text-xs text-stone-500">没有符合条件的记录。</p>}
    <details className="text-xs"><summary className="cursor-pointer text-stone-600">查看原始报告 JSON</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-stone-50 p-2 text-[10px] text-stone-600">{rawJson}</pre></details>
  </section>;
}
