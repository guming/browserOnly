import { compileReplaySteps } from '../../workflows/ReplayStepCompiler';
import React, { useEffect, useState } from 'react';
import { normalizeHttpUrl, WorkflowStore } from '../../workflows';
import type { Workflow, WorkflowExecutionMode, WorkflowStep, WorkflowVersion, WorkflowVariable, WorkflowVariableType } from '../../workflows';
import { OfficeConfigFields, officeConfigError, parseOfficeConfig } from './office/OfficeConfigFields';

interface Props { workflow: Workflow; onBack: () => void; onSaved: (workflow: Workflow) => void; }

export function WorkflowDetailView({ workflow, onBack, onSaved }: Props) {
  const [version, setVersion] = useState<WorkflowVersion | null>(null);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description);
  const [startUrl, setStartUrl] = useState(workflow.startUrl ?? '');
  const [executionMode, setExecutionMode] = useState<WorkflowExecutionMode>(workflow.executionMode ?? 'current_tab');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [variables, setVariables] = useState<WorkflowVariable[]>(workflow.variables);
  const [upgrading, setUpgrading] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const store = WorkflowStore.getInstance();
    Promise.all([store.getVersion(workflow.activeVersionId), store.listVersions(workflow.id)]).then(([current, history]) => {
      if (current) { setVersion(current); setSteps(current.steps); setInstruction(current.taskInstruction ?? ''); if (current.replayFormat === 'steps-v2') setExecutionMode(current.entryContext?.kind === 'current_page' ? 'current_tab' : 'new_tab'); setStartUrl(current.entryContext?.kind === 'url' ? current.entryContext.url : workflow.startUrl ?? ''); }
      setVersions(history.sort((a, b) => b.version - a.version));
    });
  }, [workflow.activeVersionId]);

  const selectVersion = async (versionId: string) => {
    const selected = await WorkflowStore.getInstance().getVersion(versionId);
    if (selected) { setVersion(selected); setSteps(selected.steps); setInstruction(selected.taskInstruction ?? ''); if (selected.replayFormat === 'steps-v2') setExecutionMode(selected.entryContext?.kind === 'current_page' ? 'current_tab' : 'new_tab'); setStartUrl(selected.entryContext?.kind === 'url' ? selected.entryContext.url : workflow.startUrl ?? ''); }
  };

  const updateStep = (stepId: string, patch: Partial<WorkflowStep>) => setSteps(current => current.map(step => step.id === stepId ? { ...step, ...patch, ...(patch.input !== undefined && (version?.replayFormat === 'steps-v2' || upgrading) && ['browser_click', 'browser_type'].includes(step.toolName ?? '') ? { locator: compileReplaySteps([{ executionId: step.id, toolName: step.toolName!, input: patch.input, startedAt: 0 }])[0]?.locator } : {}) } : step));

  const save = async () => {
    if (!version || saving) return;
    setSaving(true);
    setSaveError('');
    if (upgrading && !instruction.trim()) { setSaveError('Enter the complete original task instruction to upgrade.'); setSaving(false); return; }
    const replay = version.replayFormat === 'steps-v2' || upgrading;
    const nextVersion: WorkflowVersion = {
      ...version,
      id: `version-${crypto.randomUUID()}`,
      version: Math.max(version.version, ...versions.map(item => item.version)) + 1,
      source: 'manual_edit',
      steps: steps.map(step => ({ ...step })),
      replayFormat: replay ? 'steps-v2' : version.replayFormat,
      taskInstruction: replay ? instruction : version.taskInstruction,
      entryContext: replay ? (executionMode === 'current_tab' ? { kind: 'current_page' } : { kind: 'url', url: normalizeHttpUrl(startUrl) ?? '' }) : version.entryContext,
      createdAt: Date.now()
    };
    const normalizedStartUrl = normalizeHttpUrl(startUrl);
    if (executionMode === 'new_tab' && !normalizedStartUrl) {
      setSaveError('Enter a valid HTTP(S) start URL.');
      setSaving(false);
      return;
    }
    const nextWorkflow: Workflow = { ...workflow, name: name.trim() || workflow.name, description, variables, startUrl: normalizedStartUrl, executionMode, activeVersionId: nextVersion.id, status: 'active', expiresAt: undefined, updatedAt: Date.now() };
    try {
      for (const step of nextVersion.steps) {
        if (step.enabled && step.toolName === 'browser_inspect_office_table') {
          step.input = JSON.stringify(parseOfficeConfig(step.input));
        }
      }
      if (replay) await WorkflowStore.getInstance().activateVersion(nextWorkflow, nextVersion);
      else { await WorkflowStore.getInstance().saveVersion(nextVersion); await WorkflowStore.getInstance().saveWorkflow(nextWorkflow); }
      setStartUrl(normalizedStartUrl ?? '');
      setVersion(nextVersion); setVersions(current => [nextVersion, ...current]); setUpgrading(false);
      onSaved(nextWorkflow);
    } catch (error) {
      setSaveError(officeConfigError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2"><button type="button" onClick={onBack} className="text-xs font-medium text-stone-500 hover:text-stone-900">← Workflows</button><div className="flex items-center gap-2"><select aria-label="Workflow version" value={version?.id ?? ''} onChange={event => selectVersion(event.target.value)} className="h-8 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-700">{versions.map(item => <option key={item.id} value={item.id}>v{item.version}{item.id === workflow.activeVersionId ? ' · active' : ''}</option>)}</select><button type="button" onClick={save} disabled={!version || saving} className="rounded-md bg-[#315a78] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save version'}</button></div></div>
      <div><label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Name</label><input value={name} onChange={event => setName(event.target.value)} className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-sm font-medium text-stone-900 outline-none focus:border-[#315a78]" /></div>
      <div><label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Description</label><textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} className="w-full resize-none rounded-md border border-stone-300 px-2.5 py-2 text-xs text-stone-700 outline-none focus:border-[#315a78]" /></div>
      {version && version.replayFormat !== 'steps-v2' && !upgrading && <button type="button" onClick={() => { setUpgrading(true); setSteps(current => current.filter(step => !['lookup_memories', 'browser_screenshot'].includes(step.toolName ?? ''))); }}>Create replay version</button>}
      {(version?.replayFormat === 'steps-v2' || upgrading) && <label className="block">Task instruction<textarea aria-label="Task instruction" value={instruction} onChange={event => setInstruction(event.target.value)} rows={4} className="w-full rounded-md border p-2" /><p className="text-xs text-stone-500">Changing the instruction does not rebuild steps. Review the steps before saving.</p></label>}
      <div className="grid grid-cols-[1fr_auto] gap-2"><label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Start URL</span><input aria-label="Start URL" value={startUrl} onChange={event => setStartUrl(event.target.value)} placeholder="https://www.google.com" className="w-full rounded-md border border-stone-300 px-2.5 py-2 text-xs outline-none focus:border-[#315a78]" /></label><label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Run in</span><select aria-label="Run in" value={executionMode} onChange={event => setExecutionMode(event.target.value as WorkflowExecutionMode)} className="h-9 rounded-md border border-stone-300 bg-white px-2 text-xs"><option value="new_tab">New tab</option><option value="current_tab">Current tab</option></select></label></div>
      {saveError && <p role="alert" className="text-xs text-red-600">{saveError}</p>}
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-stone-900">Steps</h2><span className="text-[11px] text-stone-500">v{version?.version ?? 1}</span></div>
      <div className="space-y-2">{steps.map((step, index) => <div key={step.id}>{version?.replayFormat === 'steps-v2' ? <details className="rounded border p-3"><summary>Step {index + 1}: {step.label}</summary><StepEditor step={step} index={index} onChange={patch => updateStep(step.id, patch)} /></details> : <StepEditor step={step} index={index} onChange={patch => updateStep(step.id, patch)} />}</div>)}</div>
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-stone-900">Variables</h2><button type="button" onClick={() => setVariables(current => [...current, { key: `value${current.length + 1}`, label: 'New value', type: 'string', required: false }])} className="text-xs font-semibold text-[#315a78]">+ Add</button></div>
      <div className="space-y-2">{variables.map((variable, index) => <div key={`${variable.key}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2"><input value={variable.key} onChange={event => setVariables(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} className="rounded-md border border-stone-300 px-2 py-1.5 text-xs" placeholder="key" /><input value={variable.label} onChange={event => setVariables(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className="rounded-md border border-stone-300 px-2 py-1.5 text-xs" placeholder="label" /><button type="button" onClick={() => setVariables(current => current.filter((_, itemIndex) => itemIndex !== index))} className="px-1 text-xs text-stone-400 hover:text-red-600" aria-label={`Remove ${variable.key}`}>×</button><select value={variable.type} onChange={event => setVariables(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as WorkflowVariableType } : item))} className="rounded-md border border-stone-300 px-2 py-1.5 text-xs"><option value="string">Text</option><option value="number">Number</option><option value="date">Date</option><option value="boolean">Boolean</option><option value="secret">Secret</option></select><input value={String(variable.defaultValue ?? '')} onChange={event => setVariables(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, defaultValue: event.target.value } : item))} className="rounded-md border border-stone-300 px-2 py-1.5 text-xs" placeholder="default value" /></div>)}</div>
    </div>
  );
}

function StepEditor({ step, index, onChange }: { step: WorkflowStep; index: number; onChange: (patch: Partial<WorkflowStep>) => void }) {
  const inputValue = typeof step.input === 'string' ? step.input : JSON.stringify(step.input ?? '', null, 2);
  let officeConfig;
  if (step.toolName === 'browser_inspect_office_table') {
    try { officeConfig = JSON.parse(inputValue); } catch { /* Legacy invalid input remains editable below. */ }
  }
  return <div className={`rounded-lg border p-3 ${step.enabled ? 'border-stone-200 bg-white' : 'border-stone-200 bg-stone-50 opacity-60'}`}>
    <div className="flex items-center gap-2"><span className="text-[11px] font-semibold text-stone-400">{index + 1}</span><input value={step.label} onChange={event => onChange({ label: event.target.value })} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-stone-800 outline-none" /><label className="flex shrink-0 items-center gap-1 text-[11px] text-stone-500"><input type="checkbox" checked={step.enabled} onChange={event => onChange({ enabled: event.target.checked })} /> enabled</label></div>
    {officeConfig && Array.isArray(officeConfig.headers) ? <div className="mt-3"><OfficeConfigFields config={officeConfig} onChange={config => onChange({ input: JSON.stringify(config) })} /><p className="mt-3 text-[11px] leading-5 text-stone-500">Save this version to use the updated rule. The next complete run starts a new comparison baseline when settings change.</p></div> : <textarea value={inputValue} onChange={event => onChange({ input: event.target.value })} rows={2} className="mt-2 w-full resize-none rounded-md border border-stone-200 bg-stone-50 px-2 py-1.5 font-mono text-[10px] text-stone-600 outline-none focus:border-[#315a78]" aria-label={`Input for step ${index + 1}`} />}
    <div className="mt-1 text-[10px] text-stone-400">{step.toolName || step.type} · failure: {step.onFailure}</div>
  </div>;
}
