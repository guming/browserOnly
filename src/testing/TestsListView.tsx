import React, { useEffect, useRef, useState } from 'react';
import { parseDocument, stringify as stringifyYaml } from 'yaml';
import { TestStore } from './TestStore';
import { diffTestSuiteImport, parseTestSuite, stringifyTestSuite, TestProtocolError } from './protocol';
import { buildSafeTestReport } from './reportExport';
import type { TestCaseDefinition, TestCaseRecord, TestCaseRun, TestStepResult, TestSuiteDocument, TestSuiteRecord, TestSuiteRun } from './types';

interface PendingImport { document: TestSuiteDocument; added: TestCaseDefinition[]; changed: TestCaseDefinition[]; unchanged: TestCaseDefinition[]; missing: TestCaseRecord[]; }
interface DraftCaseSummary { id: string; name: string; }

function inspectDraftCases(source: string, activeIds: Set<string>): DraftCaseSummary[] {
  try {
    const document = parseDocument(source, { uniqueKeys: true, prettyErrors: true });
    if (document.errors.length) return [];
    const root = document.toJS({ maxAliasCount: 20 }) as { cases?: unknown[] } | null;
    if (!root || !Array.isArray(root.cases)) return [];
    return root.cases.flatMap(item => {
      if (!item || typeof item !== 'object' || typeof (item as any).id !== 'string' || activeIds.has((item as any).id)) return [];
      return [{ id: (item as any).id, name: typeof (item as any).name === 'string' && (item as any).name.trim() ? (item as any).name : `Unnamed case · ${(item as any).id}` }];
    });
  } catch { return []; }
}

function removeDraftCase(source: string, caseId: string): string {
  const document = parseDocument(source, { uniqueKeys: true, prettyErrors: true });
  if (document.errors.length) throw new Error('The draft YAML syntax is broken, so a case cannot be removed safely. Fix or replace the YAML first.');
  const root = document.toJS({ maxAliasCount: 20 }) as { cases?: unknown[] } | null;
  if (!root || !Array.isArray(root.cases)) throw new Error('The draft does not contain a readable cases list.');
  const before = root.cases.length;
  root.cases = root.cases.filter(item => !item || typeof item !== 'object' || (item as any).id !== caseId);
  if (root.cases.length === before) throw new Error('The selected draft case is no longer present.');
  return stringifyYaml(root);
}

export function TestsListView() {
  const [suites, setSuites] = useState<TestSuiteRecord[]>([]);
  const [cases, setCases] = useState<Record<string, TestCaseRecord[]>>({});
  const [pending, setPending] = useState<PendingImport>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedCases, setSelectedCases] = useState<Record<string, Set<string>>>({});
  const [concurrency, setConcurrency] = useState(2);
  const [generate, setGenerate] = useState<{ suiteId: string; goal: string }>();
  const [newGenerate, setNewGenerate] = useState<{ site: string; goal: string }>();
  const [suiteRuns, setSuiteRuns] = useState<Record<string, TestSuiteRun[]>>({});
  const [selectedRunIds, setSelectedRunIds] = useState<Record<string, string>>({});
  const [caseRuns, setCaseRuns] = useState<Record<string, TestCaseRun[]>>({});
  const [runVersions, setRunVersions] = useState<Record<string, { version: number; definition: TestCaseDefinition }>>({});
  const [stepResults, setStepResults] = useState<Record<string, TestStepResult[]>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [evidenceData, setEvidenceData] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<{ suiteId: string; caseId: string; name: string; draft: boolean }>();
  const input = useRef<HTMLInputElement>(null);
  const selectedRunKey = Object.values(selectedRunIds).join('|');
  const refresh = async () => {
    const store = TestStore.getInstance();
    const list = await store.listSuites();
    const groups = await Promise.all(list.map(async suite => [suite.suiteId, await store.listCases(suite.suiteId)] as const));
    setSuites(list); setCases(Object.fromEntries(groups));
    const runGroups = await Promise.all(list.map(async suite => [suite.suiteId, (await store.listSuiteRuns(suite.suiteId)).sort((a, b) => b.createdAt - a.createdAt)] as const));
    setSuiteRuns(Object.fromEntries(runGroups));
    const latest = runGroups.flatMap(([suiteId, runs]) => {
      const selectedId = selectedRunIds[suiteId];
      const selected = runs.find(run => run.id === selectedId) ?? runs[0];
      if (selected && !selectedId) setSelectedRunIds(current => ({ ...current, [suiteId]: selected.id }));
      return selected ? [selected] : [];
    });
    const currentCaseRuns = (await Promise.all(latest.map(run => store.listCaseRuns(run.id)))).flat();
    const versions = await Promise.all(currentCaseRuns.map(async item => [item.caseVersionId, await store.getVersion(item.caseVersionId)] as const));
    setRunVersions(Object.fromEntries(versions.flatMap(([id, version]) => version ? [[id, { version: version.version, definition: version.definition }] as const] : [])));
    setCaseRuns(Object.fromEntries(currentCaseRuns.map(run => [run.suiteRunId, currentCaseRuns.filter(item => item.suiteRunId === run.suiteRunId)])));
    const results = await Promise.all(currentCaseRuns.map(async run => [run.id, await store.listStepResults(run.id)] as const));
    setStepResults(Object.fromEntries(results));
    const evidenceIds = [...new Set(results.flatMap(([, steps]) => steps.map(step => step.screenshot).filter((id): id is string => Boolean(id))))];
    const evidenceItems = await Promise.all(evidenceIds.map(async id => [id, await store.getEvidence(id)] as const));
    const evidenceMap = Object.fromEntries(evidenceItems.flatMap(([id, item]) => item ? [[id, item.data] as const] : []));
    setEvidence(evidenceMap); setEvidenceData(evidenceMap);
  };
  useEffect(() => { void refresh().catch(err => setError(String(err))); const timer = window.setInterval(() => void refresh().catch(() => undefined), 1500); return () => window.clearInterval(timer); }, [selectedRunKey]);

  const readFile = async (file?: File) => {
    if (!file) return;
    setError(''); setPending(undefined); setBusy(true);
    try {
      const document = parseTestSuite(await file.text());
      const existingSuite = await TestStore.getInstance().getSuite(document.suiteId);
      if (!existingSuite) {
        await TestStore.getInstance().importNewSuite(document);
        await refresh();
        setError(`Imported “${document.name}”.`);
      } else {
        const existingCases = await TestStore.getInstance().listCases(document.suiteId);
        const versions = await Promise.all(existingCases.map(item => TestStore.getInstance().getVersion(item.activeVersionId)));
        const diff = diffTestSuiteImport(document, existingCases.flatMap((item, index) => versions[index] ? [{ id: versions[index]!.definition.id, definition: versions[index]!.definition }] : []));
        setPending({ document, ...diff });
      }
    } catch (err) {
      const protocolError = err as TestProtocolError;
      setError(`${protocolError.line ? `Line ${protocolError.line}${protocolError.column ? `:${protocolError.column}` : ''}: ` : ''}${protocolError.message}`);
    } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  const applyImport = async (definitions: TestCaseDefinition[]) => {
    if (!pending || !definitions.length) return;
    setBusy(true);
    try {
      if (!suites.some(item => item.suiteId === pending.document.suiteId)) await TestStore.getInstance().importNewSuite(pending.document);
      else await TestStore.getInstance().applyImportedCases(pending.document.suiteId, definitions);
      setPending(undefined); await refresh(); setError('Selected imported cases are now active.');
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  };

  const openEditor = (suiteId: string, caseId = '') => {
    const query = new URLSearchParams({ suiteId, ...(caseId ? { caseId } : {}) });
    void chrome.tabs.create({ url: chrome.runtime.getURL(`test-editor.html?${query.toString()}`) });
  };

  const deleteSelectedCase = async () => {
    if (!pendingDelete) return;
    setBusy(true); setError('');
    try {
      const { suiteId, caseId, draft } = pendingDelete;
      const store = TestStore.getInstance();
      const suite = await store.getSuite(suiteId);
      if (!suite) throw new Error('Test suite not found');
      if (suite.draftYaml) {
        try {
          const updatedYaml = removeDraftCase(suite.draftYaml, caseId);
          await store.saveSuiteDraft(suiteId, updatedYaml);
        } catch (error) {
          if (draft) throw new Error(`Fix the invalid draft before deleting this case: ${String(error)}`);
          if (String(error).includes('no longer present')) throw error;
        }
      }
      if (!draft) await store.deleteCase(suiteId, caseId);
      setSelectedCases(current => {
        const selected = new Set(current[suiteId] ?? (cases[suiteId] ?? []).map(item => item.id.slice(suiteId.length + 1)));
        selected.delete(caseId);
        return { ...current, [suiteId]: selected };
      });
      setPendingDelete(undefined);
      await refresh();
      setError('Test case deleted. Past run reports remain available.');
    } catch (err) { setError(`Could not delete test case: ${String(err)}`); }
    finally { setBusy(false); }
  };

  const runSuite = async (suite: TestSuiteRecord, explicitCaseIds?: string[]) => {
    setBusy(true); setError('');
    try {
      const selected = selectedCases[suite.suiteId];
      const caseIds = explicitCaseIds ?? (selected?.size ? [...selected] : undefined);
      const currentWindow = await chrome.windows.getCurrent();
      const response = await chrome.runtime.sendMessage({ action: 'testSuiteStart', suiteId: suite.suiteId, caseIds, concurrency, ownerWindowId: currentWindow.id });
      if (!response?.success) throw new Error(response?.error ?? 'Unable to start test run');
      setError(`Test run started: ${response.runId}`);
      await refresh();
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  };
  const generateDraftForSuite = async (suiteId: string, goal: string) => {
    const goals = goal.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (!goals.length || goals.length > 10) throw new Error('Enter 1–10 test goals, one per line.');
    if (goals.some(item => item.length < 8 || item.length > 1000)) throw new Error('Each test goal must be 8–1000 characters.');
    const store = TestStore.getInstance();
    const suite = await store.getSuite(suiteId);
    if (!suite) throw new Error('Test suite not found');
    let draft: TestSuiteDocument | undefined;
    let invalidDraft = '';
    let replacedInvalidDraft = false;
    if (suite.draftYaml) {
      try { draft = parseTestSuite(suite.draftYaml); }
      catch { invalidDraft = suite.draftYaml; }
    }
    const activeCases = await store.listCases(suiteId);
    const existingIds = new Set([...activeCases.map(item => item.id.slice(suiteId.length + 1)), ...(draft?.cases.map(item => item.id) ?? [])]);
    if (existingIds.size + goals.length > 50) throw new Error('This suite can contain at most 50 cases.');
    const currentWindow = await chrome.windows.getCurrent();
    let firstNewCaseId = '';
    let generated = 0;
    let failure = '';
    for (const item of goals) {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'testCaseGenerate', suiteId, goal: item, ownerWindowId: currentWindow.id });
        if (!response?.success) throw new Error(response?.error ?? 'Unable to generate a draft');
        const document = parseTestSuite(response.yaml);
        const existing = draft?.cases ?? document.cases.filter(candidate => activeCases.some(active => active.id === `${suiteId}:${candidate.id}`));
        const knownIds = new Set(existing.map(candidate => candidate.id));
        const newCases = document.cases.filter(candidate => !knownIds.has(candidate.id));
        if (!newCases.length) throw new Error('Generator returned no test case.');
        if (existing.length + newCases.length > 50) throw new Error('This suite can contain at most 50 cases.');
        firstNewCaseId ||= newCases[0].id;
        draft = { ...document, cases: [...existing, ...newCases] };
        if (invalidDraft) { await store.backupSuiteDraft(suiteId, invalidDraft); invalidDraft = ''; replacedInvalidDraft = true; }
        await store.saveSuiteDraft(suiteId, stringifyTestSuite(draft));
        generated += newCases.length;
      } catch (error) { failure = `Generation stopped: ${String(error)}`; break; }
    }
    if (generated) {
      const editorUrl = chrome.runtime.getURL(`test-editor.html?suiteId=${encodeURIComponent(suiteId)}&caseId=${encodeURIComponent(firstNewCaseId)}`);
      await chrome.tabs.create({ url: editorUrl });
    }
    await refresh();
    if (failure) throw new Error(generated ? `${generated} draft case(s) saved. ${failure}` : failure);
    setError(`Draft generated: ${generated} case(s).${replacedInvalidDraft ? ' Previous invalid draft saved for download.' : ''} Review their steps and expected outcomes before enabling them.`);
  };
  const generateDraft = async (suite: TestSuiteRecord) => {
    if (!generate?.goal.trim()) return;
    setBusy(true); setError('');
    try {
      await generateDraftForSuite(suite.suiteId, generate.goal);
      setGenerate(undefined);
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  };
  const openNewGenerate = async () => {
    let site = '';
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url && /^https?:\/\//i.test(activeTab.url)) site = activeTab.url;
    } catch { /* The URL can be entered manually. */ }
    setNewGenerate({ site, goal: '' });
  };
  const generateFromWebsite = async () => {
    if (!newGenerate) return;
    setBusy(true); setError('');
    let suiteId = '';
    try {
      const site = new URL(newGenerate.site.trim());
      if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password) throw new Error('Enter an HTTP or HTTPS URL without credentials.');
      suiteId = `site-${site.hostname.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${crypto.randomUUID().slice(0, 8)}`;
      await TestStore.getInstance().importNewSuite({ schemaVersion: 1, suiteId, name: site.hostname, site: site.toString(), allowedDomains: [site.hostname], cases: [] });
      await generateDraftForSuite(suiteId, newGenerate.goal.trim());
      setNewGenerate(undefined);
    } catch (err) {
      if (suiteId) {
        const created = await TestStore.getInstance().getSuite(suiteId);
        if (!created?.draftYaml) await TestStore.getInstance().removeEmptySuite(suiteId).catch(() => undefined);
      }
      setError(String(err));
    } finally { setBusy(false); }
  };
  const cancelRun = async (runId: string) => { const response = await chrome.runtime.sendMessage({ action: 'testSuiteCancel', runId }); if (!response?.success) setError(response?.error ?? 'Unable to cancel run'); await refresh(); };
  const exportReport = async (run: TestSuiteRun) => {
    const store = TestStore.getInstance();
    const caseResults = await store.listCaseRuns(run.id);
    const casesWithSteps = await Promise.all(caseResults.map(async item => ({ run: item, steps: await store.listStepResults(item.id) })));
    const report = buildSafeTestReport(run, casesWithSteps);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${run.suiteId}-${run.id}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const downloadPreviousDraft = (suite: TestSuiteRecord) => {
    if (!suite.previousDraftYaml) return;
    const url = URL.createObjectURL(new Blob([suite.previousDraftYaml], { type: 'text/yaml' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${suite.suiteId}-previous-draft.yaml`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-stone-900">Web tests</h2><p className="mt-1 text-xs text-stone-500">Generate cases from a website or import YAML.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void openNewGenerate()} disabled={busy} className="rounded-md bg-[#315a78] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Generate from website</button><button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold text-[#315a78]">Import YAML</button><input ref={input} type="file" accept=".yaml,.yml,text/yaml" className="hidden" onChange={event => void readFile(event.target.files?.[0])} /></div></div>
    {error && <div role="status" className={`rounded-md px-3 py-2 text-xs ${error.startsWith('Imported') || error.startsWith('Selected') || error.startsWith('Test run started') || error.startsWith('Draft generated') || error.startsWith('Test case deleted') ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{busy ? 'Working…' : error}</div>}
    {newGenerate && <section className="rounded-lg border border-stone-200 bg-stone-50 p-3"><h3 className="text-xs font-semibold text-stone-900">Generate test cases</h3><p className="mt-1 text-[11px] text-stone-500">Enter one test goal per line. BrowserOnly will create a separate case for each goal.</p><label className="mt-3 block text-[11px] font-semibold">Website URL<input type="url" value={newGenerate.site} onChange={event => setNewGenerate({ ...newGenerate, site: event.target.value })} placeholder="https://example.com" className="mt-1 w-full rounded border border-stone-300 bg-white p-2 text-xs font-normal" /></label><label className="mt-2 block text-[11px] font-semibold">Test goals, one per line<textarea value={newGenerate.goal} onChange={event => setNewGenerate({ ...newGenerate, goal: event.target.value })} placeholder="For example: Verify that searching for a product opens its details page" className="mt-1 w-full rounded border border-stone-300 bg-white p-2 text-xs font-normal" rows={4} /></label><p className="mt-2 text-[10px] text-amber-800">The generated case stays in a draft until you confirm its expected results.</p><div className="mt-3 flex justify-end gap-3"><button type="button" onClick={() => setNewGenerate(undefined)} className="text-[11px]">Cancel</button><button type="button" disabled={busy || !newGenerate.site.trim() || newGenerate.goal.trim().length < 8} onClick={() => void generateFromWebsite()} className="rounded bg-[#315a78] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">Generate draft</button></div></section>}
    {pending && <ImportDiff pending={pending} onCancel={() => setPending(undefined)} onApply={applyImport} />}
    {suites.length === 0 && !pending && !newGenerate ? <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-5"><p className="text-sm font-medium">No test suites yet</p><p className="mt-1 text-xs text-stone-500">Start from the current website or import an existing BrowserOnly YAML file.</p><button type="button" onClick={() => void openNewGenerate()} className="mt-3 text-xs font-semibold text-[#315a78]">Generate your first test case</button></div> : suites.map(suite => {
      const items = cases[suite.suiteId] ?? [];
      let draftCases: TestCaseDefinition[] = [];
      let draftInvalid = false;
      let draftCaseSummaries: DraftCaseSummary[] = [];
      if (suite.draftYaml) {
        try {
          const activeIds = new Set(items.map(item => item.id.slice(suite.suiteId.length + 1)));
          draftCases = parseTestSuite(suite.draftYaml).cases.filter(item => !activeIds.has(item.id));
          draftCaseSummaries = draftCases.map(({ id, name }) => ({ id, name }));
        } catch {
          draftInvalid = true;
          const activeIds = new Set(items.map(item => item.id.slice(suite.suiteId.length + 1)));
          draftCaseSummaries = inspectDraftCases(suite.draftYaml, activeIds);
        }
      }
      const suiteHistory = suiteRuns[suite.suiteId] ?? [];
      const latestRun = suiteHistory.find(run => run.id === selectedRunIds[suite.suiteId]) ?? suiteHistory[0];
      const selected = selectedCases[suite.suiteId] ?? new Set(items.map(item => item.id.slice(suite.suiteId.length + 1)));
      const caseIdForRun = (id: string) => id.slice(suite.suiteId.length + 1);
      const latestCases = latestRun ? caseRuns[latestRun.id] ?? [] : [];
      const counts = latestCases.reduce((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
      return <section key={suite.suiteId} className="border-b border-stone-200 pb-3"><div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-stone-900">{suite.name}</h3><p className="mt-1 text-[11px] text-stone-500">{new URL(suite.site).hostname} · {items.length} active cases{draftCases.length ? ` · ${draftCases.length} drafts` : ''}</p></div><div className="flex gap-1"><button type="button" onClick={() => setGenerate({ suiteId: suite.suiteId, goal: '' })} className="rounded-md border border-stone-300 px-2.5 py-1.5 text-[11px] font-semibold text-[#315a78]">Generate case</button><button type="button" onClick={() => openEditor(suite.suiteId)} className="rounded-md border border-stone-300 px-2.5 py-1.5 text-[11px] font-semibold text-[#315a78]">Edit YAML ↗</button>{suite.previousDraftYaml && <button type="button" onClick={() => downloadPreviousDraft(suite)} className="rounded-md border border-stone-300 px-2.5 py-1.5 text-[11px] font-semibold text-[#315a78]">Download previous draft</button>}</div></div>
        {draftInvalid && <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">Saved draft has invalid assertions. You can edit it in YAML, or delete individual cases below. The old draft will be kept for download.</p>}
        {generate?.suiteId === suite.suiteId && <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 p-2.5"><label className="block text-[11px] font-semibold">Test goals, one per line<textarea value={generate.goal} onChange={event => setGenerate({ ...generate, goal: event.target.value })} placeholder="For example: Verify that search results open a product page" className="mt-1 w-full rounded border border-stone-300 bg-white p-2 text-xs font-normal" rows={4} /></label><p className="mt-1 text-[10px] text-amber-800">Generated expectations require review before activation. Allowed domain: {suite.allowedDomains.join(', ')}。</p><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setGenerate(undefined)} className="text-[11px]">Cancel</button><button type="button" disabled={busy || generate.goal.trim().length < 8} onClick={() => void generateDraft(suite)} className="rounded bg-[#315a78] px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">Generate draft</button></div></div>}
        <div className="mt-2 space-y-1">
          {draftCaseSummaries.map(item => <div key={item.id} className="flex items-center gap-2 rounded-md bg-amber-50 px-2 py-2 hover:bg-amber-100">
            <button type="button" onClick={() => openEditor(suite.suiteId, item.id)} className="min-w-0 flex-1 truncate text-left text-xs text-stone-800">{item.name}</button>
            <span className="shrink-0 text-[10px] text-amber-800">Draft</span>
            <button type="button" disabled={busy} onClick={() => setPendingDelete({ suiteId: suite.suiteId, caseId: item.id, name: item.name, draft: true })} className="shrink-0 text-[10px] text-red-700 disabled:opacity-40" aria-label={`Delete draft ${item.name}`}>Delete</button>
          </div>)}
          {items.map(item => <div key={item.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-stone-50">
            <input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.has(caseIdForRun(item.id))} onChange={event => setSelectedCases(current => { const next = new Set(current[suite.suiteId] ?? items.map(caseItem => caseIdForRun(caseItem.id))); if (event.target.checked) next.add(caseIdForRun(item.id)); else next.delete(caseIdForRun(item.id)); return { ...current, [suite.suiteId]: next }; })} />
            <button type="button" onClick={() => openEditor(suite.suiteId, caseIdForRun(item.id))} className="min-w-0 flex-1 truncate text-left text-xs text-stone-800">{item.name}</button>
            <button type="button" disabled={busy || latestRun?.status === 'running'} onClick={() => setPendingDelete({ suiteId: suite.suiteId, caseId: caseIdForRun(item.id), name: item.name, draft: false })} className="shrink-0 text-[10px] text-red-700 disabled:opacity-40" aria-label={`Delete ${item.name}`}>Delete</button>
          </div>)}
        </div>
        {pendingDelete?.suiteId === suite.suiteId && <div role="group" aria-label="Confirm test case deletion" className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800"><span className="min-w-0 flex-1">Delete {pendingDelete.draft ? 'draft' : 'active case'} “{pendingDelete.name}”? Past run reports will remain.</span><button type="button" onClick={() => setPendingDelete(undefined)} className="rounded border border-stone-300 bg-white px-2 py-1">Cancel</button><button type="button" disabled={busy} onClick={() => void deleteSelectedCase()} className="rounded bg-red-700 px-2 py-1 font-semibold text-white disabled:opacity-40">Delete case</button></div>}

        <div className="mt-2 flex items-center gap-2"><label className="text-[10px] text-stone-500">Concurrency <select aria-label="Test concurrency" value={concurrency} onChange={event => setConcurrency(Number(event.target.value))} className="ml-1 rounded border border-stone-300 bg-white px-1 py-1"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label><button type="button" disabled={busy || !selected.size || latestRun?.status === 'running'} onClick={() => void runSuite(suite)} className="ml-auto rounded-md bg-[#315a78] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">Run selected {selected.size} cases</button></div>
        {latestRun && <details className="mt-3 rounded-md bg-stone-50 p-2.5"><summary className="cursor-pointer text-[11px] font-semibold text-stone-800">Run report · {latestRun.status} · {latestCases.length} cases</summary><div className="mt-2"><div className="flex items-center justify-between gap-2"><label className="text-[11px] font-semibold">Run report <select aria-label="Choose test report" value={latestRun.id} onChange={event => setSelectedRunIds(current => ({ ...current, [suite.suiteId]: event.target.value }))} className="ml-1 max-w-32 rounded border border-stone-300 bg-white px-1 py-1 font-normal">{suiteHistory.map(run => <option key={run.id} value={run.id}>{new Date(run.createdAt).toLocaleString()} · {run.status}</option>)}</select></label><div className="flex gap-2">{latestRun.status === 'running' && <button type="button" onClick={() => void cancelRun(latestRun.id)} className="text-[10px] text-red-700">Stop all</button>}<button type="button" onClick={() => void exportReport(latestRun)} className="text-[10px] text-[#315a78]">Export safe JSON</button></div></div><div className="mt-1 text-[10px] text-stone-500">{new Date(latestRun.startedAt ?? latestRun.createdAt).toLocaleString()} · Concurrency {latestRun.concurrency}</div><div className="mt-2 flex flex-wrap gap-x-2 text-[10px] text-stone-500">{['running','queued','passed','failed','blocked','cancelled'].map(status => <span key={status}>{status} {counts[status] ?? 0}</span>)}</div>{latestCases.map(run => { const snapshot = runVersions[run.caseVersionId]; return <div key={run.id} className="mt-2 border-t border-stone-200 pt-2"><div className="flex justify-between text-[11px]"><span>{snapshot?.definition.name ?? items.find(item => caseIdForRun(item.id) === run.caseId)?.name ?? run.caseId} · v{snapshot?.version ?? '?'}</span><span className={run.status === 'failed' ? 'text-red-700' : run.status === 'passed' ? 'text-emerald-700' : 'text-stone-500'}>{run.status}</span></div>{run.status === 'running' && <button type="button" onClick={() => void chrome.runtime.sendMessage({ action: 'testSuiteCancelCase', runId: latestRun.id, caseRunId: run.id })} className="mt-1 text-[10px] text-red-700">Stop case</button>}{run.failureMessage && <p className="mt-1 text-[10px] text-red-700">{run.failureMessage}</p>}{(stepResults[run.id] ?? []).map(step => <div key={step.id} className="mt-1 text-[10px] text-stone-600"><span>{step.status === 'passed' ? '✓' : '!'} {step.stepId}{step.expected ? ` · Expected: ${step.expected}` : ''}{step.actual ? ` · Actual: ${step.actual.slice(0, 70)}` : ''}</span>{step.errorMessage && <p className="mt-1 text-red-700">{step.errorMessage}</p>}{step.screenshot && evidence[step.screenshot] && <div className="mt-1"><a href={evidence[step.screenshot]} target="_blank" rel="noreferrer" className="text-[#315a78]">View failure screenshot</a><img src={evidenceData[step.screenshot]} alt={`Failure evidence for ${step.stepId}`} className="mt-1 max-h-32 rounded border border-stone-300" /></div>}</div>)}</div>; })}<div className="mt-2 flex justify-end"><button type="button" onClick={() => { const failed = latestCases.filter(item => item.status === 'failed').map(item => item.caseId); setSelectedCases(current => ({ ...current, [suite.suiteId]: new Set(failed) })); if (failed.length) void runSuite(suite, failed); }} disabled={!latestCases.some(item => item.status === 'failed')} className="text-[10px] font-semibold text-[#315a78] disabled:opacity-40">Rerun failed cases</button></div></div></details>}
      </section>;
    })}
  </div>;
}

function ImportDiff({ pending, onCancel, onApply }: { pending: PendingImport; onCancel: () => void; onApply: (definitions: TestCaseDefinition[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set([...pending.added, ...pending.changed].map(item => item.id)));
  const candidates = [...pending.added, ...pending.changed];
  return <section className="rounded-lg border border-stone-200 bg-stone-50 p-3"><div className="flex items-start justify-between"><div><h3 className="text-sm font-semibold">Import preview: {pending.document.name}</h3><p className="mt-1 text-[11px] text-stone-500">Select new or changed cases to activate. Cases missing from the file are kept.</p></div><button type="button" onClick={onCancel} aria-label="Close import preview">×</button></div><div className="mt-3 space-y-2">{candidates.map(item => <label key={item.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.has(item.id)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /><span>{item.name}</span><span className="ml-auto text-[10px] text-stone-500">{pending.added.some(value => value.id === item.id) ? 'New' : 'Changed'}</span></label>)}</div><p className="mt-3 text-[10px] text-stone-500">Unchanged {pending.unchanged.length} · Missing, kept {pending.missing.length}</p><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded border border-stone-300 bg-white px-2.5 py-1.5 text-[11px]">Cancel</button><button type="button" disabled={!selected.size} onClick={() => onApply(candidates.filter(item => selected.has(item.id)))} className="rounded bg-[#315a78] px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">Apply selected {selected.size} cases</button></div></section>;
}
