import React from 'react';
import type { ExtractionField, ExtractionFieldType } from '../../../extraction';

interface Props { fields: ExtractionField[]; onChange: (fields: ExtractionField[]) => void; }
const types: ExtractionFieldType[] = ['text', 'number', 'boolean', 'date', 'url'];

export function ExtractionFieldEditor({ fields, onChange }: Props) {
  const update = (index: number, patch: Partial<ExtractionField>) => onChange(fields.map((field, i) => i === index ? { ...field, ...patch } : field));
  return <div aria-label="Extraction fields">
    {fields.map((field, index) => <div key={`${field.key}-${index}`}>
      <input aria-label={`Field ${index + 1} label`} value={field.label} onChange={(e) => update(index, { label: e.target.value })} />
      <input aria-label={`Field ${index + 1} key`} value={field.key} onChange={(e) => update(index, { key: e.target.value.replace(/[^A-Za-z0-9_]/g, '_') })} />
      <select aria-label={`Field ${index + 1} type`} value={field.type} onChange={(e) => update(index, { type: e.target.value as ExtractionFieldType })}>{types.map(type => <option key={type} value={type}>{type}</option>)}</select>
      <button type="button" onClick={() => onChange(fields.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    <button type="button" onClick={() => onChange([...fields, { key: `field_${fields.length + 1}`, label: 'New field', type: 'text' }])}>Add field</button>
  </div>;
}
