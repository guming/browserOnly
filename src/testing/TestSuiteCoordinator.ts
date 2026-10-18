import { requestApproval, cancelRunApprovals } from '../agent/approvalManager';
import { getAgentStatus } from '../background/agentController';
import { createTestExecutionTab } from '../background/tabManager';
import { AgentStatus } from '../background/types';
import { acquireWindowTaskLease, releaseWindowTaskLease } from '../background/windowTaskLease';
import { TestStore } from './TestStore';
import { validateTestSuite } from './protocol';
import type { TestCaseDefinition, TestCaseRun, TestCaseVersion, TestStep, TestStepResult, TestSuiteRun, TestTarget } from './types';

interface ActiveRun { run: TestSuiteRun; abort: AbortController; caseRunIds: string[]; caseAborts: Map<string, AbortController>; cancelledCaseIds: Set<string>; blockedCaseIds: Set<string>; }
const activeByWindow = new Map<number, ActiveRun>();
let suiteStarting = false;

export class TestSuiteCoordinator {
  static async start(suiteId: string, ownerWindowId: number, caseIds?: string[], concurrency = 2, versionOverrides: Record<string, TestCaseVersion> = {}): Promise<TestSuiteRun> {
    const store = TestStore.getInstance();
    if (activeByWindow.size || suiteStarting) throw new Error('A test suite is already running in this Chrome profile.');
    if (getAgentStatus(ownerWindowId).status === AgentStatus.RUNNING) throw new Error('Stop the current BrowserOnly task before starting tests.');
    if (!acquireWindowTaskLease(ownerWindowId)) throw new Error('Another BrowserOnly task is using this window.');
    suiteStarting = true;
    try {
      const suite = await store.getSuite(suiteId);
      if (!suite) throw new Error('Test suite not found');
      const allItems = await store.listCases(suiteId);
      const selectedIds = caseIds?.length ? caseIds : [...allItems.map(item => item.id.slice(suiteId.length + 1)), ...Object.keys(versionOverrides)];
      const items = selectedIds.map(id => allItems.find(item => item.id === `${suiteId}:${id}`) ?? (versionOverrides[id] ? { id: `${suiteId}:${id}`, suiteId, name: versionOverrides[id].definition.name, activeVersionId: versionOverrides[id].id, updatedAt: Date.now() } : undefined)).filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (!items.length) throw new Error('Select at least one test case.');
      const versions = await Promise.all(items.map(item => versionOverrides[item.id.slice(suiteId.length + 1)] ?? store.getVersion(item.activeVersionId)));
      if (versions.some(version => !version)) throw new Error('A selected test case has no active version.');
      if (versions.some(version => version!.definition.needsReview)) throw new Error('Review generated expectations before running these cases.');
      const run: TestSuiteRun = { id: `test-run-${crypto.randomUUID()}`, suiteId, status: 'queued', concurrency: Math.max(1, Math.min(3, Math.floor(concurrency) || 2)), createdAt: Date.now(), ownerWindowId };
      const caseRuns = items.map((item, index): TestCaseRun => ({ id: `test-case-run-${crypto.randomUUID()}`, suiteRunId: run.id, suiteId, caseId: item.id.split(`${suiteId}:`).at(-1)!, caseVersionId: versions[index]!.id, status: 'queued' }));
      await store.putRun(run);
      await Promise.all(caseRuns.map(item => store.putCaseRun(item)));
      const active = { run: { ...run, status: 'running' as const, startedAt: Date.now() }, abort: new AbortController(), caseRunIds: caseRuns.map(item => item.id), caseAborts: new Map(caseRuns.map(item => [item.id, new AbortController()])), cancelledCaseIds: new Set<string>(), blockedCaseIds: new Set<string>() };
      activeByWindow.set(ownerWindowId, active);
      suiteStarting = false;
      await store.putRun(active.run);
      void executeSuite(active, suite.site, suite.allowedDomains, caseRuns, versions.map(item => item!));
      return active.run;
    } catch (error) {
      suiteStarting = false;
      activeByWindow.delete(ownerWindowId);
      releaseWindowTaskLease(ownerWindowId);
      throw error;
    }
  }

  static async trialRun(suiteId: string, ownerWindowId: number, definition: TestCaseDefinition): Promise<TestSuiteRun> {
    if (definition.needsReview) throw new Error('Confirm generated expectations before trial run.');
    const suite = await TestStore.getInstance().getSuite(suiteId);
    if (!suite) throw new Error('Test suite not found.');
    const validated = validateTestSuite({ schemaVersion: 1, suiteId, name: suite.name, site: suite.site, allowedDomains: suite.allowedDomains, cases: [definition] }).cases[0];
    if (validated.needsReview) throw new Error('Confirm generated expectations before trial run.');
    const version = await TestStore.getInstance().createUnactivatedVersion(suiteId, validated, 'generated');
    return this.start(suiteId, ownerWindowId, [validated.id], 1, { [validated.id]: version });
  }

  static async cancel(runId: string): Promise<boolean> {
    const active = [...activeByWindow.values()].find(item => item.run.id === runId);
    if (!active) return false;
    active.abort.abort();
    await TestStore.getInstance().putRun({ ...active.run, cancelRequested: true });
    for (const caseRunId of active.caseRunIds) { active.caseAborts.get(caseRunId)?.abort(); cancelRunApprovals(caseRunId); }
    return true;
  }

  static async cancelCase(runId: string, caseRunId: string): Promise<boolean> {
    const active = [...activeByWindow.values()].find(item => item.run.id === runId);
    if (!active || !active.caseRunIds.includes(caseRunId)) return false;
    active.cancelledCaseIds.add(caseRunId);
    active.caseAborts.get(caseRunId)?.abort();
    cancelRunApprovals(caseRunId);
    const store = TestStore.getInstance();
    const run = (await store.listCaseRuns(runId)).find(item => item.id === caseRunId);
    if (run?.status === 'queued') await store.putCaseRun({ ...run, status: 'cancelled', endedAt: Date.now() });
    return true;
  }

  static async handleTabClosed(tabId: number): Promise<void> {
    for (const active of activeByWindow.values()) {
      const run = (await TestStore.getInstance().listCaseRuns(active.run.id)).find(item => item.tabId === tabId && item.status === 'running');
      if (!run) continue;
      const abort = active.caseAborts.get(run.id);
      active.blockedCaseIds.add(run.id);
      abort?.abort();
      active.cancelledCaseIds.add(run.id);
      await TestStore.getInstance().putCaseRun({ ...run, status: 'blocked', endedAt: Date.now(), failureMessage: 'TAB_CLOSED: execution tab was closed.' });
    }
  }

  static async recoverInterrupted(): Promise<void> {
    const store = TestStore.getInstance();
    for (const suite of await store.listSuites()) for (const run of await store.listSuiteRuns(suite.suiteId)) {
      if (run.status !== 'running' && run.status !== 'queued') continue;
      await store.putRun({ ...run, status: 'interrupted', endedAt: Date.now() });
      for (const caseRun of await store.listCaseRuns(run.id)) if (caseRun.status === 'running' || caseRun.status === 'queued') {
        await store.putCaseRun({ ...caseRun, status: 'blocked', endedAt: Date.now(), failureMessage: 'Extension restarted before this test completed.' });
      }
      releaseWindowTaskLease(run.ownerWindowId);
    }
  }
}

async function executeSuite(active: ActiveRun, site: string, domains: string[], caseRuns: TestCaseRun[], versions: Array<{ definition: TestCaseDefinition }>): Promise<void> {
  const store = TestStore.getInstance();
  let cursor = 0;
  let writeTail = Promise.resolve();
  const withWriteLock = async <T>(run: () => Promise<T>): Promise<T> => { const prior = writeTail; let release!: () => void; writeTail = new Promise<void>(resolve => { release = resolve; }); await prior; try { return await run(); } finally { release(); } };
  const worker = async () => {
    while (!active.abort.signal.aborted) {
      const index = cursor++;
      if (index >= caseRuns.length) return;
      if (active.cancelledCaseIds.has(caseRuns[index].id)) continue;
      await executeCase(active, caseRuns[index], versions[index].definition, site, domains, withWriteLock, active.caseAborts.get(caseRuns[index].id)!);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(active.run.concurrency, caseRuns.length) }, worker));
    for (const item of await store.listCaseRuns(active.run.id)) if (item.status === 'queued') await store.putCaseRun({ ...item, status: 'cancelled', endedAt: Date.now() });
    const ended = { ...active.run, status: active.abort.signal.aborted ? 'cancelled' as const : 'completed' as const, endedAt: Date.now() };
    await store.putRun(ended);
    active.run = ended;
  } catch (error) {
    await store.putRun({ ...active.run, status: 'interrupted', endedAt: Date.now(), cancelRequested: true });
    console.error('[test-suite] runner failed', error);
  } finally {
    activeByWindow.delete(active.run.ownerWindowId);
    releaseWindowTaskLease(active.run.ownerWindowId);
  }
}

async function executeCase(active: ActiveRun, caseRun: TestCaseRun, definition: TestCaseDefinition, site: string, domains: string[], withWriteLock: <T>(run: () => Promise<T>) => Promise<T>, caseAbort: AbortController): Promise<void> {
  const store = TestStore.getInstance();
  let page: any;
  let tabId: number | undefined;
  let windowId: number | undefined;
  if (active.cancelledCaseIds.has(caseRun.id)) return;
  const current: TestCaseRun = { ...caseRun, status: 'running', startedAt: Date.now() };
  await store.putCaseRun(current);
  try {
    page = (await createTestExecutionTab(active.run.ownerWindowId, site));
  } catch (error) {
    const blocked = { ...current, status: 'blocked' as const, endedAt: Date.now(), failureMessage: `TAB_ATTACH_FAILED: ${String(error)}` };
    await store.putCaseRun(blocked); return;
  }
  // The page factory returns the Playwright page and exact Chrome IDs.
  if (page && typeof page === 'object' && 'page' in page) {
    const target = page; page = target.page; tabId = target.tabId; windowId = target.windowId;
    current.tabId = tabId; current.windowId = windowId;
    await store.putCaseRun(current);
  }
  let finalStatus: TestCaseRun['status'] = 'passed';
  let failureMessage: string | undefined;
  try {
    for (const step of definition.steps) {
      if (active.abort.signal.aborted || caseAbort.signal.aborted) throw Object.assign(new Error('Run cancelled'), { code: 'CANCELLED' });
      const result = await executeStep(active, caseAbort.signal, page, step, domains, current, withWriteLock);
      await store.putStepResult(result);
      if (result.status !== 'passed') {
        finalStatus = result.status;
        failureMessage = result.errorMessage ?? `Expected ${result.expected ?? 'condition'}; observed ${result.actual ?? 'no match'}`;
        break;
      }
    }
  } catch (error) {
    const code = (error as any)?.code ?? 'UNKNOWN';
    finalStatus = active.blockedCaseIds.has(current.id) ? 'blocked' : code === 'CANCELLED' ? 'cancelled' : code === 'APPROVAL_REJECTED' || isBlocked(code, String(error)) ? 'blocked' : 'failed';
    failureMessage = `${code}: ${String(error)}`;
  } finally {
    await store.putCaseRun({ ...current, status: finalStatus, endedAt: Date.now(), failureMessage });
    if (page && typeof page.close === 'function') await page.close().catch(() => undefined);
  }
}

async function executeStep(active: ActiveRun, signal: AbortSignal, page: any, step: TestStep, domains: string[], caseRun: TestCaseRun, withWriteLock: <T>(run: () => Promise<T>) => Promise<T>): Promise<TestStepResult> {
  const store = TestStore.getInstance();
  const startedAt = Date.now();
  let expected: string | undefined;
  let actual = '';
  try {
    if (active.abort.signal.aborted || signal.aborted) throw Object.assign(new Error('Run cancelled'), { code: 'CANCELLED' });
    if (step.act) {
      const action = step.act;
      if (action.type === 'navigate') await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      else if (action.type === 'press') await page.keyboard.press(action.key);
      else {
        const target = await resolveTarget(page, action.target);
        const perform = async () => {
          if (action.type === 'fill') await target.fill(action.value, { timeout: 10000 });
          else await target.click({ timeout: 10000 });
        };
        if (action.type === 'click' && (action.risk ?? 'write') === 'write') {
          await withWriteLock(async () => {
            const approved = await requestApproval(caseRun.tabId!, 'test_click', JSON.stringify({ caseId: caseRun.caseId, stepId: step.id, target: action.target }), `Approve click in test case “${caseRun.caseId}”`, caseRun.windowId, { runId: caseRun.id, workflowId: caseRun.suiteId, executionTabId: caseRun.tabId });
            if (!approved) throw Object.assign(new Error('Action was not approved'), { code: 'APPROVAL_REJECTED' });
            await perform();
          });
        } else await perform();
      }
      const after = new URL(page.url()).hostname.toLowerCase();
      if (!domains.some(domain => hostMatches(after, domain))) throw Object.assign(new Error(`Navigation left allowed domains: ${after}`), { code: 'DOMAIN_EXIT' });
    } else if (step.assert) {
      expected = step.assert.expected;
      const deadline = Date.now() + (step.assert.timeoutMs ?? 5000);
      let matched = false;
      let absentAtUrl: string | undefined;
      do {
        if (active.abort.signal.aborted || signal.aborted) throw Object.assign(new Error('Run cancelled'), { code: 'CANCELLED' });
        let observed: { matched: boolean; actual: string };
        try { observed = await observe(page, step); }
        catch (error) {
          if (!/execution context was destroyed|navigation interrupted|navigating and changing the content|cannot find context with specified id/i.test(String(error))) throw error;
          await new Promise(resolve => setTimeout(resolve, 300));
          continue;
        }
        actual = observed.actual;
        if (step.assert.type === 'element_absent') {
          const currentUrl = page.url();
          if (observed.matched && absentAtUrl === currentUrl) { matched = true; break; }
          absentAtUrl = observed.matched ? currentUrl : undefined;
        } else if (observed.matched) { matched = true; break; }
        await new Promise(resolve => setTimeout(resolve, 300));
      } while (Date.now() < deadline);
      if (!matched) throw Object.assign(new Error(`Assertion failed. Expected “${expected}”, observed “${actual.slice(0, 300)}”`), { code: 'ASSERTION_FAILED' });
    }
    return { id: `step-${crypto.randomUUID()}`, caseRunId: caseRun.id, stepId: step.id, status: 'passed', expected, actual: actual || (step.act ? 'Action completed' : expected), url: page.url(), startedAt, endedAt: Date.now() };
  } catch (error) {
    const code = (error as any)?.code ?? (String(error).includes('Timeout') ? 'TIMEOUT' : 'ACTION_FAILED');
    const status: TestStepResult['status'] = code === 'CANCELLED' ? 'cancelled' : isBlocked(code, String(error)) ? 'blocked' : 'failed';
    let screenshot: string | undefined;
    try { const bytes = await page.screenshot({ type: 'jpeg', quality: 45 }); const evidenceId = `${caseRun.id}-${step.id}`; await store.putEvidence(evidenceId, caseRun.id, `data:image/jpeg;base64,${bytesToBase64(bytes)}`); screenshot = evidenceId; } catch { /* A failed evidence capture does not erase the test result. */ }
    return { id: `step-${crypto.randomUUID()}`, caseRunId: caseRun.id, stepId: step.id, status, expected, actual, url: page.url(), errorCode: code, errorMessage: String(error), startedAt, endedAt: Date.now(), screenshot };
  }
}

async function resolveTarget(page: any, target: TestTarget): Promise<any> {
  const locator = locatorFor(page, target);
  if (!locator) throw Object.assign(new Error('No supported locator'), { code: 'LOCATOR_MISSING' });
  const deadline = Date.now() + 10000;
  while (true) {
    try {
      const count = await locator.count();
      if (count > 1) throw Object.assign(new Error('Locator matched multiple elements'), { code: 'LOCATOR_AMBIGUOUS' });
      if (count === 1 && await locator.isVisible()) return locator;
    } catch (error) {
      if (!/execution context was destroyed|navigation interrupted|navigating and changing the content|cannot find context with specified id/i.test(String(error))) throw error;
    }
    if (Date.now() >= deadline) throw Object.assign(new Error('Target was not visible after navigation settled'), { code: 'LOCATOR_NOT_FOUND' });
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

function locatorFor(page: any, target: TestTarget): any {
  const locator = target.placeholder ? page.getByPlaceholder(target.placeholder, { exact: true })
    : target.role ? page.getByRole(target.role, target.name ? { name: target.name, exact: true } : {})
    : target.label ? page.getByLabel(target.label, { exact: true })
    : target.testId ? page.getByTestId(target.testId)
    : target.css ? page.locator(target.css) : undefined;
  return locator;
}

async function observe(page: any, step: TestStep): Promise<{ matched: boolean; actual: string }> {
  const assertion = step.assert!;
  if (assertion.type === 'url_matches') return { matched: page.url().includes(assertion.expected!), actual: page.url() };
  if (assertion.type === 'text_present') {
    const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const expected = assertion.expected!.replace(/\s+/g, ' ').trim();
    return { matched: text.includes(expected), actual: text.slice(0, 1000) };
  }
  const locator = locatorFor(page, assertion.target!);
  if (!locator) throw Object.assign(new Error('No supported locator'), { code: 'LOCATOR_MISSING' });
  const count = await locator.count();
  if (!count) return assertion.type === 'element_absent' ? { matched: true, actual: 'Element absent' } : { matched: false, actual: 'Element not found' };
  if (count !== 1) throw Object.assign(new Error('Locator matched multiple elements'), { code: 'LOCATOR_AMBIGUOUS' });
  const target = locator;
  if (assertion.type === 'element_visible') return { matched: await target.isVisible(), actual: await target.isVisible() ? 'Element visible' : 'Element hidden' };
  if (assertion.type === 'element_absent') { const visible = await target.isVisible(); return { matched: !visible, actual: visible ? 'Element is visible' : 'Element is hidden' }; }
  const value = await target.inputValue().catch(() => target.innerText().catch(() => ''));
  return { matched: value === assertion.expected, actual: value };
}

function hostMatches(host: string, domain: string): boolean { const normalized = domain.toLowerCase().replace(/^\*\./, ''); return host === normalized || host.endsWith(`.${normalized}`); }
function isBlocked(code: string, message: string): boolean { return ['DOMAIN_EXIT', 'TAB_ATTACH_FAILED', 'TAB_CLOSED', 'AUTH_REQUIRED', 'CAPTCHA', 'PERMISSION_DENIED', 'APPROVAL_REJECTED'].includes(code) || /Target closed|has been closed|not attached/i.test(message); }
function bytesToBase64(bytes: Uint8Array): string { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
