import React from 'react';
import type { ExtractionField, ExtractionFieldType } from '../../../extraction';

interface Props { fields: ExtractionField[]; onChange: (fields: ExtractionField[]) => void; }
const types: ExtractionFieldType[] = ['text', 'number', 'boolean', 'date', 'url'];

export function ExtractionFieldEditor({ fields, onChange }: Props) {
  const update = (index: number, patch: Partial<ExtractionField>) => onChange(fields.map((field, i) => i === index ? { ...field, ...patch } : field));
  return <div aria-label="Extraction fields" className="space-y-3">
    {fields.map((field, index) => <div key={index} className="grid grid-cols-1 gap-2 rounded-md border border-stone-200 p-3 min-[375px]:grid-cols-2">
      <input className="min-w-0 w-full rounded-md border border-stone-300 px-2 py-2 text-xs" aria-label={`Field ${index + 1} label`} value={field.label} onChange={(e) => update(index, { label: e.target.value })} />
      <input className="min-w-0 w-full rounded-md border border-stone-300 px-2 py-2 text-xs" aria-label={`Field ${index + 1} key`} value={field.key} onChange={(e) => update(index, { key: e.target.value.replace(/[^A-Za-z0-9_]/g, '_') })} />
      <select className="min-w-0 rounded-md border border-stone-300 px-2 py-2 text-xs" aria-label={`Field ${index + 1} type`} value={field.type} onChange={(e) => update(index, { type: e.target.value as ExtractionFieldType })}>{types.map(type => <option key={type} value={type}>{type}</option>)}</select>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!field.required} onChange={e => update(index, { required: e.target.checked })} />Required</label>
      <button className="min-h-9 rounded-md border border-stone-300 px-2 py-2 text-xs text-[#315a78]" type="button" onClick={() => onChange(fields.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    <button className="min-h-9 rounded-md border border-stone-300 px-2 py-2 text-xs text-[#315a78]" type="button" onClick={() => onChange([...fields, { key: `field_${fields.length + 1}`, label: 'New field', type: 'text' }])}>Add field</button>
  </div>;
}
