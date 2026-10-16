import React, { useMemo, useState } from 'react';
import type { Workflow, WorkflowVariable } from '../../../workflows/types';
import { VariableField } from './VariableField';

interface Props { workflow: Workflow; onRun: (variables: Record<string, unknown>) => void; }
export function RunSetupView({ workflow, onRun }: Props) {
  const variables: WorkflowVariable[] = workflow.variables ?? [];
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(variables.map(variable => [variable.key, variable.type === 'secret' ? '' : variable.defaultValue ?? ''])));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const errors = useMemo(() => Object.fromEntries(variables.map(variable => [variable.key, validate(variable, values[variable.key])]).filter(([, error]) => error)), [variables, values]);
  const set = (key: string, value: unknown) => { setValues(current => ({ ...current, [key]: value })); setTouched(current => ({ ...current, [key]: true })); };
  return <section aria-label="Run setup" className="space-y-3">
    <h2 className="text-sm font-semibold text-slate-900">Run workflow</h2>
    <div className="space-y-3">
      {variables.map(variable => <div key={variable.key}><VariableField variable={variable} value={values[variable.key]} onChange={value => set(variable.key, value)} />{variable.type === 'fields' && !touched[variable.key] && <p className="mt-1 text-xs text-stone-500">Enter the columns to extract, one per line. For example: Title, Author, Date.</p>}{touched[variable.key] && errors[variable.key] && <p role="alert" className="mt-1 text-xs text-red-700">{errors[variable.key]}</p>}</div>)}
    </div>
    <button
      type="button"
      disabled={Object.keys(errors).length > 0}
      onClick={() => onRun(values)}
      className="inline-flex w-full items-center justify-center rounded-md bg-[#315a78] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#274a64] focus:outline-none focus:ring-2 focus:ring-[#315a78]/30 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#315a78]"
    >
      {variables.length ? 'Run' : 'Confirm and run'}
    </button>
  </section>;
}

function validate(variable: WorkflowVariable, value: unknown): string | undefined {
  if (variable.required && (value === undefined || value === '' || Array.isArray(value) && value.length === 0)) return `${variable.label} is required`;
  if (value === undefined || value === '') return undefined;
  if (variable.type === 'url' && !/^https?:\/\//i.test(String(value))) return 'Enter an HTTP or HTTPS URL';
  if (variable.type === 'enum' && !variable.options?.some(option => option.value === value)) return 'Choose one of the available options';
  if (variable.type === 'number') { const number = Number(value); if (!Number.isFinite(number)) return 'Enter a valid number'; if (variable.validation?.min !== undefined && number < variable.validation.min) return `Minimum is ${variable.validation.min}`; if (variable.validation?.max !== undefined && number > variable.validation.max) return `Maximum is ${variable.validation.max}`; }
  if (typeof value === 'string' && variable.validation?.maxLength && value.length > variable.validation.maxLength) return `Maximum length is ${variable.validation.maxLength}`;
  if (typeof value === 'string' && variable.validation?.pattern && !new RegExp(variable.validation.pattern).test(value)) return 'Value does not match the required format';
  return undefined;
}
