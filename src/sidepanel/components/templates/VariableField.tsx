import React from 'react';
import type { WorkflowVariable } from '../../../workflows/types';

interface Props { variable: WorkflowVariable; value: unknown; onChange: (value: unknown) => void; }
export function VariableField({ variable, value, onChange }: Props) {
  const label = variable.label;
  if (variable.type === 'boolean') return <label><input type="checkbox" aria-label={label} checked={Boolean(value)} onChange={e => onChange(e.target.checked)} /> {label}</label>;
  if (variable.type === 'enum') return <label>{label}<select aria-label={label} value={String(value ?? '')} onChange={e => onChange(e.target.value)}><option value="">Select…</option>{(variable.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (variable.type === 'tabs' || variable.type === 'fields') return <label>{label}<textarea aria-label={label} placeholder={variable.placeholder} value={Array.isArray(value) ? value.join('\n') : String(value ?? '')} onChange={e => onChange(e.target.value.split('\n').filter(Boolean))} /></label>;
  return <label>{label}<input aria-label={label} type={variable.type === 'secret' ? 'password' : variable.type === 'url' ? 'url' : variable.type === 'number' ? 'number' : variable.type === 'date' ? 'date' : 'text'} value={String(value ?? '')} placeholder={variable.placeholder} onChange={e => onChange(e.target.value)} /></label>;
}
