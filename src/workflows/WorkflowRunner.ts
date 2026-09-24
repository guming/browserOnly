import type { BrowserTool } from '../agent/tools/types';
import type { WorkflowAssertion, WorkflowRun, WorkflowStep, WorkflowStepRun, WorkflowVersion } from './types';
import { WorkflowStore } from './WorkflowStore';
import { requestApproval } from '../agent/approvalManager';

export interface WorkflowRunnerCallbacks {
  onStepStart?: (step: WorkflowStep) => void;
  onStepEnd?: (step: WorkflowStep, result: string) => void;
  onStatus?: (status: WorkflowRun['status']) => void;
}

export interface WorkflowRunnerOptions {
  tools: BrowserTool[];
  variables?: Record<string, unknown>;
  allowedDomains?: string[];
  callbacks?: WorkflowRunnerCallbacks;
  context?: { tabId?: number; windowId?: number; ownerTabId?: number; runId?: string; cancelReason?: string };
  runner?: WorkflowRunner;
  pageRef?: { current: any };
  onPageHandoff?: (page: any, tabId?: number) => void;
  repairQuery?: (step: WorkflowStep, failedSelector: string) => Promise<string | undefined>;
}

export class WorkflowRunner {
  private cancelled = false;
  currentRunId?: string;
  private readonly store = WorkflowStore.getInstance();

  cancel(): void { this.cancelled = true; }

  async run(workflowId: string, version: WorkflowVersion, options: WorkflowRunnerOptions): Promise<WorkflowRun> {
    this.cancelled = false;
    const run: WorkflowRun = {
      id: `run-${crypto.randomUUID()}`,
      workflowId,
      versionId: version.id,
      status: 'running',
      startedAt: Date.now(),
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      ownerTabId: options.context?.ownerTabId,
      executionTabId: options.context?.tabId,
      executionWindowId: options.context?.windowId
    };
    this.currentRunId = run.id;
    await this.store.saveRun(run);
    options.callbacks?.onStatus?.('running');

    let currentStepRun: WorkflowStepRun | undefined;
    try {
      if (options.allowedDomains?.length) {
        const hostname = await resolveActiveHostname(options);
        const allowed = options.allowedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
        if (!allowed) throw new Error(`Domain not allowed for workflow: ${hostname || 'unknown'}`);
      }
      for (const step of version.steps) {
        if (this.cancelled) throw new Error('Workflow cancelled');
        if (!step.enabled || !step.toolName) continue;
        const stepRun: WorkflowStepRun = {
          id: `step-run-${crypto.randomUUID()}`,
          runId: run.id,
          stepId: step.id,
          status: 'running',
          startedAt: Date.now()
        };
        currentStepRun = stepRun;
        await this.store.saveStepRun(stepRun);
        options.callbacks?.onStepStart?.(step);
        const tool = options.tools.find(candidate => candidate.name === step.toolName);
        if (!tool) throw new Error(`Tool not found: ${step.toolName}`);
        const input = substituteVariables(step.input, options.variables ?? {});
        for (const assertion of step.preconditions ?? []) {
          if (!(await evaluateAssertion(assertion, options.tools))) throw new Error(`Precondition failed: ${assertion.type}`);
        }
        const pagesBefore = step.toolName === 'browser_click' && options.pageRef?.current?.context
          ? options.pageRef.current.context().pages()
          : undefined;
        if ((step.risk === 'write' || step.risk === 'irreversible') && options.context?.tabId) {
          const approved = await requestApproval(
            options.context.tabId,
            step.toolName,
            typeof input === 'string' ? input : JSON.stringify(input),
            `Workflow step requires approval: ${step.label}`,
            options.context.windowId,
            { runId: run.id, workflowId, executionTabId: options.context.tabId, ownerTabId: options.context.ownerTabId },
          );
          if (!approved) throw new Error('Action rejected by user');
        }
        const candidates = step.locator ? locatorCandidates(step.locator, input) : [input];
        // A write may have happened even when its response was lost; never replay it blindly.
        const maxAttempts = step.risk === 'read'
          ? Math.max(1, Math.min(3, step.retryPolicy?.maxAttempts ?? 1)) : 1;
        let result = '';
        let lastError: unknown;
        for (let index = 0; index < candidates.length * maxAttempts; index++) {
          if (this.cancelled) throw new Error('Workflow cancelled');
          if (index > 0 && index % candidates.length === 0 && step.retryPolicy.delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, step.retryPolicy.delayMs));
          }
          const candidate = candidates[index % candidates.length];
          try {
            result = await withTimeout(tool.func(typeof candidate === 'string' ? candidate : JSON.stringify(candidate)), step.timeoutMs);
            // AST extraction relies on page.evaluate(), which is not available
            // in every extension/isolated-world context. Keep recorded
            // automations runnable by falling back to the plain page reader.
            if (/window is not defined/i.test(result) && step.toolName === 'browser_read_text_ast') {
              const fallbackTool = options.tools.find(candidateTool => candidateTool.name === 'browser_read_text');
              if (fallbackTool) {
                result = await withTimeout(fallbackTool.func(''), step.timeoutMs);
              }
            }
            if (!/^error\b|^Error\b|^Action cancelled/i.test(result.trim())) break;
            lastError = new Error(result);
          } catch (error) {
            // Some page.evaluate implementations throw instead of returning
            // an error string. Apply the same AST fallback to both forms.
            if (step.toolName === 'browser_read_text_ast' && /window is not defined/i.test(String(error))) {
              const fallbackTool = options.tools.find(candidateTool => candidateTool.name === 'browser_read_text');
              if (fallbackTool) {
                try {
                  result = await withTimeout(fallbackTool.func(''), step.timeoutMs);
                  if (!/^error\b|^Error\b|^Action cancelled/i.test(result.trim())) break;
                  lastError = new Error(result);
                  continue;
                } catch (fallbackError) {
                  lastError = fallbackError;
                  continue;
                }
              }
            }
            lastError = error;
          }
        }
        if ((!result && lastError || /^error\b|^Action cancelled/i.test(result.trim()))
          && step.onFailure === 'repair' && ['browser_query', 'browser_click', 'browser_type'].includes(step.toolName)
          && typeof input === 'string' && options.repairQuery && !this.cancelled) {
          const repaired = await options.repairQuery(step, input);
          if (repaired && repaired !== input) {
            if ((step.risk === 'write' || step.risk === 'irreversible') && options.context?.tabId) {
              const approved = await requestApproval(
                options.context.tabId, step.toolName, repaired,
                `Workflow repair proposes a different target: ${step.label}`,
                options.context.windowId,
                { runId: run.id, workflowId, executionTabId: options.context.tabId, ownerTabId: options.context.ownerTabId },
              );
              if (!approved) throw new Error('Repaired action rejected by user');
            }
            const repairedResult = await withTimeout(tool.func(repaired), step.timeoutMs);
            if (!/^error\b|^Action cancelled/i.test(repairedResult.trim())) {
              result = repairedResult;
              run.llmCalls += 1;
            }
          }
        }
        if (!result && lastError) throw lastError;
        if (/^error\b|^Action cancelled/i.test(result.trim())) throw new Error(result);
        if (pagesBefore && options.pageRef?.current?.context) {
          const pagesAfter = options.pageRef.current.context().pages();
          const newPages = pagesAfter.filter((candidate: any) => !pagesBefore.includes(candidate));
          const openerPages = [];
          for (const candidate of newPages) {
            const opener = await candidate.opener?.().catch(() => undefined);
            if (!opener || opener === options.pageRef.current) openerPages.push(candidate);
          }
          if (openerPages.length > 1) throw new Error('AMBIGUOUS_NEW_TABS: multiple pages opened by workflow step');
          if (openerPages.length === 1) {
            const nextPage = openerPages[0];
            await nextPage.waitForLoadState?.('domcontentloaded').catch(() => {});
            options.pageRef.current = nextPage;
            const tabId = await findTabIdForPage(nextPage, options.context?.windowId);
            if (tabId !== undefined && options.context) options.context.tabId = tabId;
            options.onPageHandoff?.(nextPage, tabId);
          }
        }
        for (const assertion of step.postconditions ?? []) {
          if (!(await evaluateAssertion(assertion, options.tools))) throw new Error(`Postcondition failed: ${assertion.type}`);
        }
        stepRun.status = 'succeeded';
        stepRun.endedAt = Date.now();
        await this.store.saveStepRun(stepRun);
        options.callbacks?.onStepEnd?.(step, result);
      }
      for (const assertion of version.finalAssertions) {
        if (!(await evaluateAssertion(assertion, options.tools))) throw new Error(`Final assertion failed: ${assertion.type}`);
      }
      run.status = 'succeeded';
    } catch (error) {
      run.status = this.cancelled ? 'cancelled' : 'failed';
      const rawMessage = error instanceof Error ? error.message : String(error);
      const failedStep = currentStepRun
        ? version.steps.find(step => step.id === currentStepRun?.stepId)
        : undefined;
      run.failureMessage = currentStepRun
        ? `Step failed: ${failedStep?.label ?? currentStepRun.stepId} [tool=${failedStep?.toolName ?? 'unknown'}, stepId=${currentStepRun.stepId}]. ${rawMessage}`
        : rawMessage;
      console.error('[WorkflowRunner] execution failed', {
        workflowId,
        toolName: failedStep?.toolName,
        stepId: currentStepRun?.stepId,
        message: rawMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (currentStepRun) {
        currentStepRun.status = 'failed';
        currentStepRun.endedAt = Date.now();
        currentStepRun.errorCode = 'ASSERTION_OR_TOOL_FAILURE';
        currentStepRun.errorMessage = run.failureMessage;
        await this.store.saveStepRun(currentStepRun);
        run.failureStepId = currentStepRun.stepId;
      }
    }
    run.endedAt = Date.now();
    run.executionTabId = options.context?.tabId ?? run.executionTabId;
    run.executionWindowId = options.context?.windowId ?? run.executionWindowId;
    await this.store.saveRun(run);
    options.callbacks?.onStatus?.(run.status);
    return run;
  }
}

async function findTabIdForPage(page: any, windowId?: number): Promise<number | undefined> {
  try {
    const url = page.url?.();
    const tabs = await chrome.tabs.query(windowId === undefined ? {} : { windowId });
    return tabs.find(tab => tab.url === url)?.id;
  } catch { return undefined; }
}

async function resolveActiveHostname(options: WorkflowRunnerOptions): Promise<string> {
  // WorkflowRunner executes in the MV3 service worker. Use Chrome's native tab
  // API there instead of invoking a Playwright tool whose runtime assumes a
  // page/window global during its call setup.
  if (options.context?.tabId !== undefined && typeof chrome !== 'undefined' && chrome.tabs?.get) {
    const tab = await chrome.tabs.get(options.context.tabId);
    return tab.url ? new URL(tab.url).hostname : '';
  }

  const activeTab = await options.tools.find(tool => tool.name === 'browser_get_active_tab')?.func('');
  const urlMatch = activeTab?.match(/https?:\/\/[^\s"']+/i);
  return urlMatch ? new URL(urlMatch[0]).hostname : '';
}

function locatorCandidates(locator: NonNullable<WorkflowStep['locator']>, input: unknown): unknown[] {
  const raw = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  const suffix = raw.includes('|') ? raw.slice(raw.indexOf('|')) : '';
  const candidates: string[] = [];
  for (const kind of locator.fallbackOrder) {
    const value = kind === 'role' && locator.role ? `role=${locator.role}${locator.accessibleName ? `:name=${locator.accessibleName}` : ''}`
      : kind === 'label' && locator.label ? `label=${locator.label}`
      : kind === 'text' && locator.text ? `text=${locator.text}`
      : kind === 'testId' && locator.testId ? `[data-testid="${locator.testId}"]`
      : kind === 'css' && locator.css ? locator.css : '';
    if (value) candidates.push(value + (suffix && !raw.startsWith(value) ? suffix : ''));
  }
  return candidates.length ? candidates : [input];
}

function substituteVariables(value: unknown, variables: Record<string, unknown>): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => String(variables[key] ?? `{{${key}}}`));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Step timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function matchesAssertion(assertion: WorkflowAssertion, state: { url?: string; text?: string; elementVisible?: boolean; value?: string; rowCount?: number }): boolean {
  switch (assertion.type) {
    case 'url_matches': return new RegExp(String(assertion.expected)).test(state.url ?? '');
    case 'text_present': return (state.text ?? '').includes(String(assertion.expected));
    case 'element_visible': return state.elementVisible === true;
    case 'element_absent': return state.elementVisible === false;
    case 'value_equals': return state.value === String(assertion.expected);
    case 'row_count': return state.rowCount === Number(assertion.expected);
    default: return false;
  }
}

async function evaluateAssertion(assertion: WorkflowAssertion, tools: BrowserTool[]): Promise<boolean> {
  const find = (name: string) => tools.find(tool => tool.name === name);
  try {
    if (assertion.type === 'url_matches') {
      const result = await find('browser_get_active_tab')?.func('');
      const url = result ? JSON.parse(result).url : undefined;
      return matchesAssertion(assertion, { url });
    }
    if (assertion.type === 'text_present') {
      const result = await (find('browser_read_text') ?? find('browser_read_text_enhanced'))?.func('');
      return matchesAssertion(assertion, { text: result });
    }
    if (assertion.type === 'element_visible' || assertion.type === 'element_absent') {
      const locator = assertion.locator?.css || assertion.locator?.text || assertion.locator?.accessibleName;
      if (!locator) return false;
      const result = await find('browser_query')?.func(locator);
      if (!result || /^error\b/i.test(result.trim())) return false;
      const visible = result !== '[]';
      return assertion.type === 'element_visible' ? visible : !visible;
    }
    return false;
  } catch { return false; }
}
