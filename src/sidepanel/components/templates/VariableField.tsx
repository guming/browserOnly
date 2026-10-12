import React, { useEffect, useState } from 'react';
import type { WorkflowVariable } from '../../../workflows/types';

interface Props { variable: WorkflowVariable; value: unknown; onChange: (value: unknown) => void; }
export function VariableField({ variable, value, onChange }: Props) {
  const label = variable.label;
  if (variable.type === 'boolean') return <label><input type="checkbox" aria-label={label} checked={Boolean(value)} onChange={e => onChange(e.target.checked)} /> {label}</label>;
  if (variable.type === 'enum') return <label>{label}<select aria-label={label} value={String(value ?? '')} onChange={e => onChange(e.target.value)}><option value="">Select…</option>{(variable.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (variable.type === 'tab' || variable.type === 'tabs') return <TabVariable variable={variable} value={value} onChange={onChange} />;
  if (variable.type === 'fields') return <label>{label}<textarea aria-label={label} placeholder={variable.placeholder ?? 'One field per line'} value={Array.isArray(value) ? value.map(field => typeof field === 'string' ? field : (field as { label?: string }).label ?? '').join('\n') : String(value ?? '')} onChange={e => onChange(e.target.value.split('\n').map((name, index) => ({ key: fieldKey(name, index), label: name.trim(), type: 'text', required: false })).filter(field => field.label))} /></label>;
  return <label>{label}<input aria-label={label} type={variable.type === 'secret' ? 'password' : variable.type === 'url' ? 'url' : variable.type === 'number' ? 'number' : variable.type === 'date' ? 'date' : 'text'} value={String(value ?? '')} placeholder={variable.placeholder} min={variable.validation?.min} max={variable.validation?.max} maxLength={variable.validation?.maxLength} pattern={variable.validation?.pattern} onChange={e => onChange(variable.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} /></label>;
}

function TabVariable({ variable, value, onChange }: Props) {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  useEffect(() => { chrome.tabs.query({ currentWindow: true }).then(items => setTabs(items.filter(tab => typeof tab.id === 'number' && /^https?:/i.test(tab.url ?? '')))); }, []);
  const selected = variable.type === 'tabs' ? (Array.isArray(value) ? value.map(Number) : []) : [Number(value)].filter(Number.isFinite);
  return <fieldset><legend>{variable.label}</legend><div className="max-h-32 overflow-auto">{tabs.map(tab => <label key={tab.id} className="block"><input type={variable.type === 'tabs' ? 'checkbox' : 'radio'} name={variable.key} checked={selected.includes(tab.id!)} onChange={event => onChange(variable.type === 'tabs' ? (event.target.checked ? [...selected, tab.id!] : selected.filter(id => id !== tab.id)) : tab.id)} /> {tab.title || tab.url}</label>)}</div></fieldset>;
}

function fieldKey(label: string, index: number): string { return label.trim().normalize('NFKD').replace(/[^a-zA-Z0-9]+(.)?/g, (_, next: string) => next ? next.toUpperCase() : '').replace(/^[^a-zA-Z]+/, '') || `field${index + 1}`; }
