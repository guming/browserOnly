import React, { useEffect, useMemo, useRef, useState } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { TestStore } from './TestStore';
import { diffTestSuiteImport, parseTestSuite, stringifyTestSuite, TestProtocolError } from './protocol';
import type { TestCaseRecord, TestCaseVersion, TestSuiteDocument, TestSuiteRecord } from './types';

export function TestEditor() {
  const params = new URLSearchParams(location.search);
  const suiteId = params.get('suiteId') ?? '';
  const [focusCaseId, setFocusCaseId] = useState(params.get('caseId') ?? '');
  const [suite, setSuite] = useState<TestSuiteRecord>();
  const [cases, setCases] = useState<TestCaseRecord[]>([]);
  const [versions, setVersions] = useState<Record<string, TestCaseVersion>>({});
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<TestCaseVersion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmedAssertions, setConfirmedAssertions] = useState<Record<string, boolean>>({});
  const editorHost = useRef<HTMLDivElement>(null);
  const editorView = useRef<EditorView>();
  const onEditorChange = useRef<(value: string) => void>(() => undefined);
  const applyingExternalSource = useRef(false);
  const draftSaveTimer = useRef<number | undefined>(undefined);
  const sourceRef = useRef(source);

  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => () => { if (draftSaveTimer.current !== undefined) window.clearTimeout(draftSaveTimer.current); }, []);

  useEffect(() => {
    if (!suite || !editorHost.current) return;
    const view = new EditorView({
      doc: sourceRef.current,
      parent: editorHost.current,
      extensions: [
        keymap.of([{ key: 'Mod-f', run: () => { setSearchOpen(true); window.setTimeout(() => document.getElementById('test-yaml-search')?.focus(), 0); return true; } }, indentWithTab]),
        basicSetup,
        yaml(),
        oneDark,
        EditorView.contentAttributes.of({ 'aria-label': 'Test suite YAML' }),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          '.cm-content': { padding: '16px 0', minHeight: '100%' },
          '.cm-gutters': { backgroundColor: '#20211c', color: '#aaa99f', border: 'none' },
          '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px' },
          '.cm-line': { padding: '0 16px' },
        }),
        EditorView.updateListener.of(update => { if (update.docChanged && !applyingExternalSource.current) onEditorChange.current(update.state.doc.toString()); }),
      ],
    });
    editorView.current = view;
    return () => { editorView.current = undefined; view.destroy(); };
  }, [Boolean(suite)]);

  useEffect(() => {
    const view = editorView.current;
    if (view && view.state.doc.toString() !== source) {
      applyingExternalSource.current = true;
      try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } }); }
      finally { applyingExternalSource.current = false; }
    }
  }, [source]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const store = TestStore.getInstance();
      const loaded = await store.getSuite(suiteId);
      if (!loaded) { setError('Test suite not found'); return; }
      const suiteCases = await store.listCases(suiteId);
      const caseVersions = await Promise.all(suiteCases.map(item => store.getVersion(item.activeVersionId)));
      if (cancelled) return;
      setSuite(loaded); setCases(suiteCases);
      setVersions(Object.fromEntries(caseVersions.filter((value): value is TestCaseVersion => Boolean(value)).map(value => [value.definition.id, value])));
      if (focusCaseId) setHistory((await store.listVersions(`${suiteId}:${focusCaseId}`)).sort((a, b) => b.version - a.version));
      const document: TestSuiteDocument = { schemaVersion: 1, suiteId: loaded.suiteId, name: loaded.name, site: loaded.site, allowedDomains: loaded.allowedDomains, cases: caseVersions.filter((value): value is TestCaseVersion => Boolean(value)).map(value => value.definition) };
      setSource(loaded.draftYaml ?? stringifyTestSuite(document));
    })().catch(err => setError(String(err)));
    return () => { cancelled = true; };
  }, [suiteId, focusCaseId]);

  const parsed = useMemo(() => { try { return { value: parseTestSuite(source), error: '' }; } catch (err) { const protocolError = err as TestProtocolError; return { value: undefined, error: `${protocolError.line ? `Line ${protocolError.line}${protocolError.column ? `:${protocolError.column}` : ''} · ` : ''}${protocolError.message}` }; } }, [source]);
  const changedCases = useMemo(() => {
    if (!parsed.value) return [];
    const current = Object.entries(versions).map(([id, version]) => ({ id, definition: version.definition }));
    const diff = diffTestSuiteImport(parsed.value, current);
    return [...diff.added, ...diff.changed];
  }, [parsed.value, versions]);
  const focusedVersion = versions[focusCaseId];
  const currentDefinition = parsed.value?.cases.find(item => item.id === focusCaseId);
  const reviewAssertions = currentDefinition?.steps.filter(step => step.assert).map(step => ({ step, key: `${focusCaseId}:${step.id}:${JSON.stringify(step.assert)}` })) ?? [];
  const changed = Boolean(currentDefinition && (!focusedVersion || JSON.stringify(focusedVersion.definition) !== JSON.stringify(currentDefinition)));
  const sidebarCases = parsed.value?.cases.map(item => ({ id: item.id, name: item.name })) ?? cases.map(item => ({ id: item.id.slice(suiteId.length + 1), name: item.name }));
  const missingIds = useMemo(() => {
    if (!parsed.value) return [];
    const present = new Set(parsed.value.cases.map(item => item.id));
    return Object.keys(versions).filter(id => !present.has(id));
  }, [parsed.value, versions]);
  const matches = useMemo(() => searchTerm ? source.split('\n').flatMap((line, index) => line.toLowerCase().includes(searchTerm.toLowerCase()) ? [index] : []) : [], [searchTerm, source]);

  const handleChange = (value: string) => {
    sourceRef.current = value;
    setSource(value); setSaved(false); setMessage('');
    if (draftSaveTimer.current !== undefined) window.clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = window.setTimeout(() => {
      draftSaveTimer.current = undefined;
      void TestStore.getInstance().saveSuiteDraft(suiteId, value).then(() => {
        if (sourceRef.current === value) setSaved(true);
      }).catch(err => setError(String(err)));
    }, 300);
  };
  onEditorChange.current = handleChange;
  const findNext = () => {
    const view = editorView.current;
    if (!searchTerm || !view) return;
    const lower = view.state.doc.toString().toLowerCase();
    const from = view.state.selection.main.to;
    const start = lower.indexOf(searchTerm.toLowerCase(), from);
    const index = start < 0 ? lower.indexOf(searchTerm.toLowerCase()) : start;
    if (index >= 0) { view.dispatch({ selection: { anchor: index, head: index + searchTerm.length }, scrollIntoView: true }); view.focus(); }
  };
  const activate = async () => {
    if (!suite || !parsed.value || parsed.error) return;
    try {
      const store = TestStore.getInstance();
      if (parsed.value.suiteId !== suiteId) throw new Error('suiteId is stable and cannot be changed in the editor.');
      if (missingIds.length) throw new Error(`Stable case IDs cannot be removed or rewritten: ${missingIds.join(', ')}.`);
      if (changedCases.some(item => item.needsReview)) throw new Error('Generated expectations must be reviewed before enabling.');
      const expected = Object.fromEntries(changedCases.map(item => [item.id, versions[item.id]?.id ?? '']));
      await store.activateDefinitionsAndMetadata(suiteId, changedCases, { name: parsed.value.name, site: parsed.value.site, allowedDomains: parsed.value.allowedDomains }, expected);
      setSuite({ ...suite, name: parsed.value.name, site: parsed.value.site, allowedDomains: parsed.value.allowedDomains });
      const nextCases = await store.listCases(suiteId);
      const nextVersions = await Promise.all(nextCases.map(item => store.getVersion(item.activeVersionId)));
      setCases(nextCases); setVersions(Object.fromEntries(nextVersions.filter((value): value is TestCaseVersion => Boolean(value)).map(value => [value.definition.id, value])));
      if (focusCaseId) setHistory((await store.listVersions(`${suiteId}:${focusCaseId}`)).sort((a, b) => b.version - a.version));
      await store.saveSuiteDraft(suiteId);
      setMessage(`Enabled ${changedCases.length} changed case${changedCases.length === 1 ? '' : 's'}.`);
    } catch (err) { setMessage(`Could not save: ${String(err)}`); }
  };
  const trialRun = async () => {
    const definition = parsed.value?.cases.find(item => item.id === focusCaseId);
    if (!definition || parsed.error) return;
    if (definition.needsReview) {
      setMessage('Confirm each assertion in Review expectations before trial running or enabling this case.');
      return;
    }
    try {
      const currentWindow = await chrome.windows.getCurrent();
      const response = await chrome.runtime.sendMessage({ action: 'testCaseTrialRun', suiteId, ownerWindowId: currentWindow.id, definition });
      if (!response?.success) throw new Error(response?.error ?? 'Unable to trial run this draft.');
      setMessage(`Draft trial run started: ${response.runId}. This version was saved for the report but is not active.`);
    } catch (err) { setMessage(`Could not trial run: ${String(err)}`); }
  };

  const confirmExpectations = () => {
    if (!parsed.value || !currentDefinition?.needsReview || !reviewAssertions.length || reviewAssertions.some(item => !confirmedAssertions[item.key])) return;
    const reviewed = { ...parsed.value, cases: parsed.value.cases.map(item => item.id === focusCaseId ? { ...item, needsReview: false } : item) };
    handleChange(stringifyTestSuite(reviewed));
    setMessage('Expectations confirmed. You can now trial run this draft.');
  };

  const deleteCase = async () => {
    if (!suite || !focusCaseId || !parsed.value?.cases.some(item => item.id === focusCaseId)) return;
    const definition = parsed.value.cases.find(item => item.id === focusCaseId)!;
    if (!window.confirm(`Delete case “${definition.name}”? Past run reports will be kept.`)) return;
    try {
      const next = { ...parsed.value, cases: parsed.value.cases.filter(item => item.id !== focusCaseId) };
      const store = TestStore.getInstance();
      await store.deleteCase(suiteId, focusCaseId);
      await store.saveSuiteDraft(suiteId, next.cases.length ? stringifyTestSuite(next) : undefined);
      setSource(stringifyTestSuite(next));
      setVersions(current => { const updated = { ...current }; delete updated[focusCaseId]; return updated; });
      setHistory([]);
      setFocusCaseId(next.cases[0]?.id ?? '');
      setMessage(`Deleted case “${definition.name}”.`);
    } catch (err) { setMessage(`Could not delete case: ${String(err)}`); }
  };

  if (!suite && !error) return <div className="p-8 text-sm text-stone-600">Loading test suite…</div>;
  if (error && !suite) return <div className="p-8 text-sm text-red-700">{error}</div>;
  return <main className="flex h-screen flex-col bg-white text-stone-800">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 px-5">
      <div><span className="font-bold text-[#315a78]">BrowserOnly</span><span className="ml-4 text-xs text-stone-500">Tests / {suite?.name} / {focusCaseId || 'YAML editor'}</span></div>
      <div className="flex items-center gap-2"><button type="button" onClick={() => setSearchOpen(value => !value)} className="rounded-md border border-stone-300 px-2.5 py-2 text-xs">Search ⌘F</button><button type="button" disabled={!parsed.value || Boolean(parsed.error)} onClick={() => parsed.value && handleChange(stringifyTestSuite(parsed.value))} className="rounded-md border border-stone-300 px-2.5 py-2 text-xs disabled:opacity-40">Format YAML</button><button type="button" onClick={() => void deleteCase()} disabled={!currentDefinition || Boolean(parsed.error)} className="rounded-md border border-red-300 px-2.5 py-2 text-xs font-semibold text-red-700 disabled:opacity-40">Delete case</button><span className={`rounded px-2 py-1 text-[11px] ${parsed.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{parsed.error ? 'Invalid YAML' : `${changedCases.length} changed`}</span><button type="button" disabled={!currentDefinition || Boolean(parsed.error) || Boolean(currentDefinition?.needsReview)} title={currentDefinition?.needsReview ? 'Confirm the assertions in Review expectations first.' : undefined} onClick={trialRun} className="rounded-md border border-[#315a78] px-3 py-2 text-xs font-semibold text-[#315a78] disabled:opacity-40">Trial run draft</button><button type="button" disabled={!parsed.value || Boolean(parsed.error) || !changedCases.length || missingIds.length > 0 || changedCases.some(item => item.needsReview)} onClick={activate} className="rounded-md bg-[#315a78] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save and enable</button></div>
    </header>
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_270px] max-[900px]:grid-cols-[170px_minmax(0,1fr)] max-[900px]:[&>aside:last-child]:hidden">
      <aside className="overflow-y-auto border-r border-stone-200 bg-stone-50"><h2 className="px-4 pb-2 pt-5 text-[10px] font-bold uppercase tracking-wider text-stone-500">{suite?.name}</h2>{sidebarCases.map(item => <a key={item.id} href={`?suiteId=${encodeURIComponent(suiteId)}&caseId=${encodeURIComponent(item.id)}`} className={`block border-l-[3px] px-3 py-3 text-xs ${item.id === focusCaseId ? 'border-[#315a78] bg-[#eaf1f5] font-semibold text-[#315a78]' : 'border-transparent text-stone-700 hover:bg-stone-100'}`}>{item.id} · {item.name}<small className="mt-1 block text-[10px] font-normal text-stone-500">{versions[item.id] ? `v${versions[item.id].version} active` : 'New draft'}</small></a>)}</aside>
      <section className="flex min-w-0 flex-col"><div className="flex h-10 shrink-0 items-center justify-between border-b border-stone-200 px-4 text-xs"><strong>{suite?.name}.yaml</strong><span className="text-stone-500">{saved ? 'Draft saved locally' : 'Saving draft…'}</span></div>{searchOpen && <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2"><input id="test-yaml-search" aria-label="Search YAML" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') findNext(); if (event.key === 'Escape') setSearchOpen(false); }} placeholder="Search YAML" className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-xs"/><span className="text-[10px] text-stone-500">{matches.length} lines</span><button type="button" onClick={() => findNext()} className="text-xs text-[#315a78]">Next</button><button type="button" onClick={() => { setSearchOpen(false); setSearchTerm(''); }} className="text-xs">Close</button></div>}<div ref={editorHost} aria-label="Test suite YAML" className="min-h-0 flex-1 overflow-hidden bg-[#272822]" />
      <footer className={`h-9 shrink-0 border-t px-4 py-2 text-[11px] ${parsed.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-stone-200 bg-stone-50 text-emerald-700'}`}>{parsed.error || (message || (changed ? 'Draft differs from the active version. Existing reports keep their original version.' : 'Schema valid.'))}</footer></section>
      <aside className="overflow-y-auto border-l border-stone-200 bg-stone-50"><section className="border-b border-stone-200 p-4"><h3 className="text-xs font-semibold">Validation</h3><p className={`mt-2 text-xs ${parsed.error ? 'text-red-700' : 'text-emerald-700'}`}>{parsed.error || `✓ ${parsed.value?.cases.length ?? 0} cases · ${parsed.value?.cases.reduce((sum, item) => sum + item.steps.length, 0) ?? 0} steps`}</p>{missingIds.length > 0 && <p className="mt-2 text-xs text-red-700">Stable IDs cannot be removed: {missingIds.join(', ')}</p>}{parsed.value && changedCases.some(item => item.needsReview) && <p className="mt-2 text-xs text-amber-700">Confirm the assertions in Review expectations to unlock trial run and activation.</p>}</section>{currentDefinition?.needsReview && !parsed.error && <section className="border-b border-stone-200 p-4"><h3 className="text-xs font-semibold">Review expectations</h3><p className="mt-2 text-xs text-stone-600">Check each assertion against the behavior you want to test.</p><div className="mt-3 space-y-2">{reviewAssertions.map(({ step, key }) => <label key={key} className="flex items-start gap-2 text-[11px]"><input type="checkbox" checked={Boolean(confirmedAssertions[key])} onChange={event => setConfirmedAssertions(current => ({ ...current, [key]: event.target.checked }))} className="mt-0.5"/><span><strong>{step.id}</strong> · {step.assert?.type}{step.assert?.expected ? ` · ${step.assert.expected}` : ''}{step.assert?.target ? ` · ${JSON.stringify(step.assert.target)}` : ''}</span></label>)}</div><button type="button" onClick={confirmExpectations} disabled={!reviewAssertions.length || reviewAssertions.some(item => !confirmedAssertions[item.key])} className="mt-3 rounded bg-[#315a78] px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">Confirm expectations</button></section>}<section className="border-b border-stone-200 p-4"><h3 className="text-xs font-semibold">Active version diff</h3>{changed ? <div className="mt-3 rounded border-l-2 border-amber-500 bg-amber-50 p-3 text-[11px]"><div>{focusedVersion ? `case ${focusCaseId} · v${focusedVersion.version} → v${focusedVersion.version + 1}` : `New draft case ${focusCaseId}`}</div><div className="mt-2 text-stone-600">Review the YAML changes before enabling.</div></div> : <p className="mt-2 text-xs text-stone-500">No changes to {focusCaseId || 'the selected case'}.</p>}</section><section className="p-4"><h3 className="text-xs font-semibold">Version history</h3>{history.map(version => <div key={version.id} className="mt-2 rounded border border-stone-200 bg-white p-3 text-[11px]"><div className="flex justify-between"><strong>v{version.version}</strong><span>{version.id === focusedVersion?.id ? 'active' : version.source}</span></div><div className="mt-1 text-stone-500">{new Date(version.createdAt).toLocaleString()}</div>{version.id !== focusedVersion?.id && <><button type="button" onClick={() => { setSource(current => { const doc = parseTestSuite(current); const next = { ...doc, cases: doc.cases.map(item => item.id === focusCaseId ? version.definition : item) }; const yaml = stringifyTestSuite(next); handleChange(yaml); return yaml; }); }} className="mt-2 text-[#315a78]">Load into draft</button><button type="button" onClick={async () => { try { const restored = await TestStore.getInstance().restoreVersionAsNew(suiteId, focusCaseId, version.id, focusedVersion!.id); const next = (await TestStore.getInstance().listVersions(`${suiteId}:${focusCaseId}`)).sort((a, b) => b.version - a.version); setHistory(next); setVersions(current => ({ ...current, [focusCaseId]: restored })); setMessage(`Restored v${version.version} as new active v${restored.version}.`); } catch (err) { setMessage(`Could not restore: ${String(err)}`); } }} className="ml-3 text-amber-800">Restore</button></>}</div>)}<button type="button" onClick={() => window.close()} className="mt-4 text-xs font-semibold text-[#315a78]">Close editor</button></section></aside>
    </div>
  </main>;
}
