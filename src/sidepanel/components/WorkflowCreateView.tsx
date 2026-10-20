import React, { useState } from 'react';
import { normalizeHttpUrl } from '../../workflows';
import type { Workflow, WorkflowVersion } from '../../workflows/types';

interface Candidate { workflow: Workflow; version: WorkflowVersion }

export function WorkflowCreateView({ onCreated, onCancel }: { onCreated: (candidate: Candidate) => void | Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const normalizedUrl = normalizeHttpUrl(url);

  const create = async () => {
    if (!normalizedUrl || !name.trim() || !instruction.trim() || busy) return;
    setBusy(true);
    setError('');
    const now = Date.now();
    const workflowId = `workflow-${crypto.randomUUID()}`;
    const versionId = `version-${crypto.randomUUID()}`;
    const host = new URL(normalizedUrl).hostname;
    const workflow: Workflow = {
      id: workflowId,
      name: name.trim(),
      description: instruction.trim(),
      schemaVersion: 1,
      status: 'active',
      triggerDomains: [host],
      variables: [],
      executionMode: 'new_tab',
      startUrl: normalizedUrl,
      activeVersionId: versionId,
      createdAt: now,
      updatedAt: now
    };
    const version: WorkflowVersion = {
      id: versionId,
      workflowId,
      version: 1,
      source: 'manual_edit',
      runStrategy: 'goal',
      taskInstruction: instruction.trim(),
      entryContext: { kind: 'url', url: normalizedUrl },
      steps: [],
      finalAssertions: [],
      createdAt: now
    };
    try {
      await onCreated({ workflow, version });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-4">
    <div className="flex items-center gap-2"><button type="button" onClick={onCancel} className="text-sm text-stone-500">←</button><h2 className="text-base font-semibold">New workflow</h2></div>
    <label className="block text-xs font-medium">Name<input aria-label="Workflow name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Check order status" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" /></label>
    <label className="block text-xs font-medium">URL<input aria-label="Workflow URL" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />{url.trim() && !normalizedUrl && <span className="mt-1 block font-normal text-red-600">Enter a valid HTTP(S) URL.</span>}</label>
    <label className="block text-xs font-medium">What should the workflow do?<textarea aria-label="Workflow instructions" value={instruction} onChange={event => setInstruction(event.target.value)} rows={5} placeholder="Describe the task in plain language. For example: Open my latest order and summarize its delivery status." className="mt-1 w-full resize-y rounded-md border border-stone-300 px-3 py-2 text-sm leading-5" /><span className="mt-1 block font-normal text-stone-500">The agent plans the steps from this description each time you run it.</span></label>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    <button type="button" disabled={!name.trim() || !normalizedUrl || !instruction.trim() || busy} onClick={() => void create()} className="w-full rounded-md bg-[#315a78] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Creating workflow…' : 'Create workflow'}</button>
  </div>;
}
