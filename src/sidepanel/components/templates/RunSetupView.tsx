import React, { useMemo, useState } from 'react';
import type { Workflow, WorkflowVariable } from '../../../workflows/types';
import { VariableField } from './VariableField';

interface Props { workflow: Workflow; onRun: (variables: Record<string, unknown>) => void; }
export function RunSetupView({ workflow, onRun }: Props) {
  const variables: WorkflowVariable[] = workflow.variables ?? [];
  const [values, setValues] = useState<Record<string, unknown>>({});
  const missing = useMemo(() => variables.some(variable => variable.required && (values[variable.key] === undefined || values[variable.key] === '')), [variables, values]);
  const set = (key: string, value: unknown) => setValues(current => ({ ...current, [key]: value }));
  return <section aria-label="Run setup"><h2>Run workflow</h2>{variables.map(variable => <VariableField key={variable.key} variable={variable} value={values[variable.key]} onChange={value => set(variable.key, value)} />)}<button type="button" disabled={missing} onClick={() => onRun(values)}>{variables.length ? 'Run' : 'Confirm and run'}</button></section>;
}
