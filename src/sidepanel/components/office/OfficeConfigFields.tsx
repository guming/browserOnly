import React from 'react';
import { officeConfigSchema, type OfficeConfig } from '../../../office/types';

const inputClass = 'mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-xs';
export function officeConfigError(error: unknown): string {
  const parsed = error as { issues?: Array<{ message: string }> };
  return parsed.issues?.map(issue => issue.message).join(' ') || (error instanceof Error ? error.message : String(error));
}

export function parseOfficeConfig(input: unknown): OfficeConfig {
  return officeConfigSchema.parse(typeof input === 'string' ? JSON.parse(input) : input);
}

/** Shared by setup and saved-task editing so rules stay understandable after saving. */
export function OfficeConfigFields({ config, onChange }: { config: OfficeConfig; onChange: (config: OfficeConfig) => void }) {
  const patch = (change: Partial<OfficeConfig>) => onChange({ ...config, ...change });
  const columns = config.headers.map((header, index) => <option key={index} value={index}>{header || `Column ${index + 1}`}</option>);
  return <div className="space-y-3">
    <label className="block text-xs">Unique record ID<select className={inputClass} value={config.keyColumn ?? ''} onChange={e => patch({ keyColumn: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">Do not compare runs</option>{columns}</select></label>
    <p className="text-[11px] leading-5 text-stone-500">Choose a stable ticket or order number to identify new, changed and continuing matches. Missing or duplicate IDs are reported and skipped.</p>
    <label className="block text-xs">Include rows where<select className={inputClass} value={config.rule?.column ?? ''} onChange={e => patch({ rule: e.target.value === '' ? undefined : { column: Number(e.target.value), operator: config.rule?.operator ?? 'contains', value: config.rule?.value ?? '' } })}><option value="">All rows</option>{columns}</select></label>
    {config.rule && <>
      <label className="block text-xs">Condition<select className={inputClass} value={config.rule.operator} onChange={e => patch({ rule: { ...config.rule!, operator: e.target.value as NonNullable<OfficeConfig['rule']>['operator'] } })}><option value="contains">Contains text</option><option value="equals">Equals text</option><option value="greater_than">Number greater than</option><option value="less_than">Number less than</option><option value="older_than_days">Date older than days</option></select></label>
      <label className="block text-xs">{config.rule.operator === 'older_than_days' ? 'Number of days' : 'Value'}<input className={inputClass} value={config.rule.value} onChange={e => patch({ rule: { ...config.rule!, value: e.target.value } })} placeholder={config.rule.operator === 'older_than_days' ? '2' : 'Value to match'} /></label>
      {config.rule.operator === 'older_than_days' && <p className="text-[11px] leading-5 text-stone-500">Use the last-response date column, in YYYY-MM-DD or ISO date-time format. Unreadable dates are reported rather than guessed.</p>}
    </>}
    <label className="block text-xs">Record link column<select className={inputClass} value={config.detailLinkColumn ?? ''} onChange={e => patch({ detailLinkColumn: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">Link back to the list</option>{columns}</select></label>
    <p className="text-[11px] leading-5 text-stone-500">Choose a column containing one link to each record. If no unique link is found, the result opens the list instead.</p>
    <label className="block text-xs">Sort matching rows by<select className={inputClass} value={config.sort?.column ?? ''} onChange={e => patch({ sort: e.target.value === '' ? undefined : { column: Number(e.target.value), direction: config.sort?.direction ?? 'ascending', priority: config.sort?.priority } })}><option value="">Keep page order</option>{columns}</select></label>
    {config.sort && <>
      <label className="block text-xs">Sort order<select className={inputClass} value={config.sort.direction} onChange={e => patch({ sort: { ...config.sort!, direction: e.target.value as 'ascending' | 'descending' } })}><option value="ascending">Ascending</option><option value="descending">Descending</option></select></label>
      <label className="block text-xs">Priority values, first to last<textarea className={inputClass} rows={3} value={config.sort.priority?.join('\n') ?? ''} onChange={e => patch({ sort: { ...config.sort!, priority: e.target.value.split('\n') } })} placeholder={'VIP\nPremium\nStandard'} /></label>
      <p className="text-[11px] leading-5 text-stone-500">Optional: one customer level per line. Listed levels appear first in this order; other values follow the sort order.</p>
    </>}
    <details className="text-xs"><summary className="cursor-pointer text-stone-600">Pagination and limits</summary>
      <label className="mt-2 block">Next-page button selector<input className={inputClass} value={config.nextSelector} onChange={e => patch({ nextSelector: e.target.value })} placeholder="button.next" /></label>
      <p className="mt-1 text-[11px] leading-5 text-stone-500">Advanced: enter the CSS selector of the next-page link or button. Leave empty to read one page.</p>
      <label className="mt-2 block">Maximum pages<input type="number" min={1} max={20} className={inputClass} value={config.maxPages} onChange={e => patch({ maxPages: Number(e.target.value) })} /></label>
      <label className="mt-2 block">Maximum rows<input type="number" min={1} max={2000} className={inputClass} value={config.maxRows} onChange={e => patch({ maxRows: Number(e.target.value) })} /></label>
    </details>
  </div>;
}
