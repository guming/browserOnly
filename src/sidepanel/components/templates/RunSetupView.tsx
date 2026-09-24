import React, { useMemo, useState } from 'react';
import type { Workflow, WorkflowVariable } from '../../../workflows/types';
import { VariableField } from './VariableField';

interface Props { workflow: Workflow; onRun: (variables: Record<string, unknown>) => void; }
export function RunSetupView({ workflow, onRun }: Props) {
  const variables: WorkflowVariable[] = workflow.variables ?? [];
  const [values, setValues] = useState<Record<string, unknown>>({});
  const missing = useMemo(() => variables.some(variable => variable.required && (values[variable.key] === undefined || values[variable.key] === '')), [variables, values]);
  const set = (key: string, value: unknown) => setValues(current => ({ ...current, [key]: value }));
  return <section aria-label="Run setup" className="space-y-3">
    <h2 className="text-sm font-semibold text-slate-900">Run workflow</h2>
    <div className="space-y-3">
      {variables.map(variable => <VariableField key={variable.key} variable={variable} value={values[variable.key]} onChange={value => set(variable.key, value)} />)}
    </div>
    <button
      type="button"
      disabled={missing}
      onClick={() => onRun(values)}
      className="inline-flex w-full items-center justify-center rounded-md bg-[#315a78] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#274a64] focus:outline-none focus:ring-2 focus:ring-[#315a78]/30 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#315a78]"
    >
      {variables.length ? 'Run' : 'Confirm and run'}
    </button>
  </section>;
}
