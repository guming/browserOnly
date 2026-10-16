import { WorkflowScheduleControl } from './WorkflowScheduleControl';
import React, { useEffect, useState } from 'react';
import { WorkflowStore } from '../../workflows/WorkflowStore';
import type { Workflow, WorkflowRun, WorkflowStep, WorkflowVersion } from '../../workflows/types';
import type { WorkflowEntryContext, WorkflowRunStrategy } from '../../workflows/types';
import { WorkflowExecutionControls } from './WorkflowExecutionControls';
import { normalizeHttpUrl } from '../../workflows/WorkflowCompiler';
import { runResultLabel, runStatusLabel } from '../../workflows/runPresentation';

interface Props {
  workflowId: string;
  fallbackName: string;
  onOpenWorkflow?: (workflowId: string, mode?: 'run') => void;
}

function ruleLabel(step: WorkflowStep): string {
  const recordedLabel = step.toolName?.replace(/^browser_/, '').replace(/_/g, ' ');
  const legacyReadLabel = step.toolName === 'browser_read_main_for_workflow' && step.label === 'read main';
  if (step.label && step.label !== recordedLabel && !legacyReadLabel) return step.label;
  const target = step.locator?.accessibleName || step.locator?.label || step.locator?.text;
  if (step.toolName === 'browser_navigate' && typeof step.input === 'string') {
    try { return `Open ${new URL(step.input).hostname}`; } catch { return 'Open the task webpage'; }
  }
  const rules: Record<string, string> = {
    browser_click: target ? `Click “${target}”` : 'Click the selected page element',
    browser_type: target ? `Fill in “${target}”` : 'Fill in the selected field',
    browser_select: target ? `Choose an option in “${target}”` : 'Choose a field option',
    browser_read_main_for_workflow: 'Read the main page content',
    browser_read_main: 'Read the main page content',
    browser_read_text: 'Read the page text',
    browser_get_title: 'Read the page title',
    browser_get_overview: 'Review the page content',
    browser_query: 'Find matching information on the page',
    browser_snapshot_dom: 'Inspect the page structure',
    browser_accessible_tree: 'Find the page controls',
    browser_wait_for_navigation: 'Wait for the next page to load',
    browser_navigate_back: 'Return to the previous page',
    browser_navigate_forward: 'Go to the next page',
    browser_keyboard_type: 'Enter the task text',
    browser_press_key: 'Use the recorded keyboard shortcut',
    browser_handle_dialog: 'Respond to the page dialog',
    browser_scroll: 'Scroll the page',
    browser_drag: 'Move the selected page element',
    browser_tab_new: 'Open a new tab',
    browser_tab_select: 'Switch to the task tab',
    browser_tab_close: 'Close the task tab',
  };
  return rules[step.toolName ?? ''] || step.label || 'Complete the recorded step';
}

export function WorkflowChatCard({ workflowId, fallbackName, onOpenWorkflow }: Props) {
  const [data, setData] = useState<{ workflow: Workflow; version: WorkflowVersion; runs: WorkflowRun[] }>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveStrategy, setSaveStrategy] = useState<WorkflowRunStrategy>('steps');
  const [saveEntry, setSaveEntry] = useState<WorkflowEntryContext>({ kind: 'current_page' });
  const [saveUrl, setSaveUrl] = useState('');

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const store = WorkflowStore.getInstance();
        const workflow = await store.getWorkflow(workflowId);
        if (!workflow) { if (!disposed) { setData(undefined); setLoaded(true); } return; }
        const [version, runs] = await Promise.all([store.getVersion(workflow.activeVersionId), store.listRuns(workflowId)]);
        if (!disposed) {
          setData(version ? { workflow, version, runs: runs.sort((a, b) => b.startedAt - a.startedAt) } : undefined);
          setLoaded(true);
        }
      } catch { if (!disposed) { setError('Unable to load this automation.'); setLoaded(true); } }
    };
    void load();
    const timer = window.setInterval(load, 3000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [workflowId]);

  const save = async () => {
    if (!data || busy) return;
    setBusy(true); setError('');
    try {
      const store = WorkflowStore.getInstance();
      const current = await store.getWorkflow(workflowId);
      if (!current || current.status === 'archived') throw new Error('This automation is no longer available.');
      if (current.status === 'active') { setConfirming(false); return; }
      const version = await store.getVersion(current.activeVersionId);
      if (!version) throw new Error('Task rules are unavailable.');
      if (saveStrategy === 'steps' && !version.steps.some(step => step.enabled && step.toolName)) throw new Error('This task has no executable rules. Choose Explore by goal or edit the task.');
      if (saveStrategy === 'goal' && !version.taskInstruction?.trim()) throw new Error('This task has no saved goal. Review the task before saving.');
      const url = saveEntry.kind === 'url' ? normalizeHttpUrl(saveUrl) : undefined;
      if (saveEntry.kind === 'url' && !url) throw new Error('Enter a valid HTTP(S) start URL.');
      const entry: WorkflowEntryContext = saveEntry.kind === 'url' ? { kind: 'url', url: url! } : saveEntry;
      const nextVersion: WorkflowVersion = { ...version, id: `version-${crypto.randomUUID()}`, version: version.version + 1, source: 'manual_edit', runStrategy: saveStrategy, entryContext: entry, createdAt: Date.now() };
      const workflow: Workflow = { ...current, name: saveName.trim() || current.name, executionMode: entry.kind === 'current_page' ? 'current_tab' : 'new_tab', startUrl: url, activeVersionId: nextVersion.id, status: 'active', expiresAt: undefined, updatedAt: Date.now() };
      await store.activateVersion(workflow, nextVersion);
      setData(previous => previous ? { ...previous, workflow, version: nextVersion } : previous);
      setConfirming(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save this task.'); }
    finally { setBusy(false); }
  };

  const run = async () => {
    if (!data || busy) return;
    setBusy(true); setError('');
    try {
      const workflow = await WorkflowStore.getInstance().getWorkflow(workflowId);
      if (!workflow || workflow.status !== 'active') throw new Error('Save this task before running it.');
      if (workflow.variables.length) { onOpenWorkflow?.(workflowId, 'run'); return; }
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (typeof tab?.id !== 'number') throw new Error('Open a browser tab before running this task.');
      const response = await chrome.runtime.sendMessage({ action: 'runWorkflow', workflowId, versionId: workflow.activeVersionId, variables: {}, ownerTabId: tab.id, ownerWindowId: tab.windowId, executionMode: workflow.executionMode });
      if (response?.success === false) throw new Error(typeof response.error === 'string' ? response.error : 'Unable to start this task.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to start this task.'); }
    finally { setBusy(false); }
  };

  const changeExecution = async (strategy: WorkflowRunStrategy, entry: WorkflowEntryContext) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const store = WorkflowStore.getInstance();
      const workflow = await store.getWorkflow(workflowId);
      if (!workflow || workflow.status === 'archived') throw new Error('This task is no longer available.');
      const version = await store.getVersion(workflow.activeVersionId);
      if (!version) throw new Error('Task rules are unavailable.');
      if (strategy === 'goal' && !version.taskInstruction?.trim()) throw new Error('Add a task goal in Automations first.');
      const next: WorkflowVersion = { ...version, id: `version-${crypto.randomUUID()}`, version: version.version + 1,
        source: 'manual_edit', runStrategy: strategy, entryContext: entry, createdAt: Date.now() };
      const updated: Workflow = { ...workflow, executionMode: entry.kind === 'current_page' ? 'current_tab' : 'new_tab', activeVersionId: next.id, updatedAt: Date.now() };
      await store.activateVersion(updated, next);
      setData(previous => previous ? { ...previous, workflow: updated, version: next } : previous);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update execution settings.'); }
    finally { setBusy(false); }
  };

  if (!data) return <section aria-label="Automation" className="my-2 rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-500"><p className="break-words font-semibold text-stone-800">{fallbackName}</p><p className="mt-1">{error || (loaded ? 'This task has expired or is no longer available.' : 'Loading automation…')}</p></section>;

  const { workflow, version, runs } = data;
  const saved = workflow.status === 'active';
  const archived = workflow.status === 'archived';
  const running = runs.some(item => item.status === 'running' || item.status === 'repairing');
  const steps = version.steps.filter(step => step.enabled);
  const strategy = version.runStrategy ?? 'steps';
  const entry: WorkflowEntryContext = version.entryContext ?? (workflow.executionMode === 'current_tab' ? { kind: 'current_page' } : { kind: 'url', url: workflow.startUrl ?? '' });
  const source = entry.kind === 'current_page' ? 'Current webpage' : entry.kind === 'standalone' ? 'Independent task' : entry.url || workflow.triggerDomains.join(', ');
  let sourceLabel = source;
  try { sourceLabel = new URL(source).hostname; } catch { /* A domain or page label is already readable. */ }
  const needsInputs = workflow.variables.length > 0;
  const openSave = () => {
    setError(''); setSaveName(workflow.name); setSaveStrategy(strategy); setSaveEntry(entry);
    setSaveUrl(entry.kind === 'url' ? entry.url : workflow.startUrl ?? ''); setConfirming(true);
  };
  if (confirming && !saved) return <section aria-label="Save as workflow" className="my-2 space-y-3 rounded-lg border border-stone-200 bg-white p-3 text-xs">
    <button type="button" className="font-medium text-[#315a78]" onClick={() => setConfirming(false)}>← Back to task</button>
    <h3 className="text-base font-semibold text-stone-900">Save as workflow</h3>
    <p className="text-stone-600">Review how this task will run next time.</p>
    <label className="block font-medium text-stone-700">Name<input aria-label="Workflow name" value={saveName} onChange={event => setSaveName(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 p-2 text-xs" /></label>
    <div><span className="font-medium text-stone-700">Starting point</span><select aria-label="Save starting point" value={saveEntry.kind} onChange={event => { const kind = event.target.value; setSaveEntry(kind === 'url' ? { kind: 'url', url: saveUrl } : kind === 'standalone' ? { kind: 'standalone' } : { kind: 'current_page' }); if (kind === 'standalone') setSaveStrategy('goal'); }} className="mt-1 w-full rounded-md border border-stone-300 p-2"><option value="current_page">Current page</option><option value="url">Saved webpage</option>{version.taskInstruction?.trim() && <option value="standalone">Start independently</option>}</select></div>
    {saveEntry.kind === 'url' && <label className="block font-medium text-stone-700">Start URL<input aria-label="Start URL" value={saveUrl} onChange={event => setSaveUrl(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 p-2 text-xs" /></label>}
    <div><span className="font-medium text-stone-700">Execution method</span><select aria-label="Save execution method" value={saveStrategy} onChange={event => setSaveStrategy(event.target.value as WorkflowRunStrategy)} className="mt-1 w-full rounded-md border border-stone-300 p-2"><option value="steps" disabled={saveEntry.kind === 'standalone'}>Replay rules</option><option value="goal" disabled={!version.taskInstruction?.trim()}>Explore by goal</option></select></div>
    <div className="rounded-md bg-stone-50 p-2 text-stone-600"><p>{steps.length} recorded steps · {workflow.variables.length} inputs{steps.some(step => step.risk === 'write' || step.risk === 'irreversible') ? ' · Write actions require approval' : ''}</p>{saveStrategy === 'steps' && <ol className="mt-2 list-inside list-decimal space-y-1">{steps.map(step => <li key={step.id}>{ruleLabel(step)}</li>)}</ol>}{workflow.variables.length > 0 && <p className="mt-2">Inputs: {workflow.variables.map(variable => variable.label || variable.key).join(', ')}</p>}</div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void save()} className="w-full rounded-md bg-[#315a78] p-2 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Confirm save'}</button>
  </section>;
  return <section aria-label={`Automation: ${workflow.name}`} className="my-2 space-y-2 rounded-lg border border-stone-200 bg-white p-3">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="min-w-0 flex-1 break-words text-sm font-semibold text-stone-900">{workflow.name}</h3>
      <span className={`shrink-0 text-xs ${running ? 'text-[#315a78]' : saved ? 'text-emerald-700' : 'text-stone-500'}`}>{running ? 'Running' : saved ? 'Saved' : archived ? 'Archived' : 'Draft'}</span>
    </header>
    <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-stone-600"><span title={source} className="break-words">{sourceLabel}</span><span aria-hidden="true">·</span><span>{version.runStrategy === 'goal' ? 'Explore by goal' : 'Replay rules'}</span></p>
    {!saved && !archived && workflow.expiresAt && <p className="text-[11px] text-stone-500">Save before {new Date(workflow.expiresAt).toLocaleString()}</p>}
    {!archived && <WorkflowExecutionControls strategy={strategy} entry={entry} startUrl={workflow.startUrl || (entry.kind === 'url' ? entry.url : undefined)} goalAvailable={!!version.taskInstruction?.trim()} disabled={busy || running} onChange={(nextStrategy, nextEntry) => void changeExecution(nextStrategy, nextEntry)} />}
    {strategy === 'goal' ? <div className="border-t border-stone-100 pt-2"><p className="text-xs font-medium text-stone-600">Task goal</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-stone-700">{version.taskInstruction || 'Add a task goal in Automations.'}</p><p className="mt-1 text-[11px] text-stone-500">Plans new steps each run.</p></div> : <div className="border-t border-stone-100 pt-2"><p className="text-xs font-medium text-stone-600">Rules · {steps.length} steps</p><ol className="mt-1 space-y-1">{steps.map((step, index) => <li key={step.id} className="flex items-start gap-2 text-xs leading-5 text-stone-700"><span className="shrink-0 text-stone-400">{index + 1}.</span><span className="min-w-0 break-words">{ruleLabel(step)}</span></li>)}</ol>{!steps.length && <p className="mt-2 text-xs text-stone-500">No executable rules. Review this task in Automations.</p>}</div>}
    {!!runs.length && <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">{runs.slice(0, 2).map((item, index) => <div key={item.id} className="text-[11px]"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-stone-500">{index ? 'Previous' : 'Last run'} · {new Date(item.startedAt).toLocaleString()}</span><span className={item.status === 'succeeded' ? 'text-emerald-700' : item.status === 'failed' ? 'text-red-700' : 'text-stone-600'}>{runStatusLabel(item)}</span></div>{runResultLabel(item) && <p className="mt-1 font-semibold text-stone-800">{runResultLabel(item)}</p>}</div>)}</div>}
    <WorkflowScheduleControl workflow={workflow} onUpdated={updated => setData(previous => previous ? { ...previous, workflow: updated } : previous)} />
    {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
    <footer className="mt-3 flex flex-wrap items-center gap-2">
      {!archived && <button type="button" disabled={busy || running || (saved && needsInputs && !onOpenWorkflow)} onClick={() => void (saved ? run() : openSave())} className="rounded-md bg-[#315a78] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#274a64] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315a78] disabled:opacity-50">{busy ? 'Please wait…' : running ? 'Running…' : saved ? needsInputs ? 'Set inputs & run' : 'Run now' : 'Save as workflow'}</button>}
      {onOpenWorkflow && <button type="button" onClick={() => onOpenWorkflow(workflowId)} className="rounded-md px-2 py-1.5 text-xs font-medium text-[#315a78] hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#315a78]">View task →</button>}
    </footer>
  </section>;
}
