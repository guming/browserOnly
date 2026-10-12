import { executeReplayStep } from './ReplayStepExecutor';
import type { Page } from 'playwright-crx';
import type { BrowserTool } from '../agent/tools/types';
import { lookupMemories } from '../agent/tools/memoryTools';
import { getAllTools } from '../agent/tools';
import { WorkflowRunner, WorkflowRunnerOptions } from './WorkflowRunner';
import type { WorkflowRun, WorkflowVersion } from './types';
import { extractionRequestSchema, validateExtractionResult } from '../extraction/extractionSchema';
import { toCsv, toJson } from '../extraction/exporters';
import { preferProvidedPageForTools, retryAfterNavigation } from '../agent/tools/utils';
import { proposeQuerySelector } from './WorkflowQueryRepair';
import { WorkflowStore } from './WorkflowStore';
import { ConfigManager } from '../background/configManager';
import { createProvider } from '../models/providers/factory';
import { createOfficeInspectionTool } from '../office/inspectionTool';

const WORKFLOW_MAX_RETURN_CHARS = 20_000;

/** Standalone Workflow execution surface. It deliberately does not create or use BrowserAgent. */
export class WorkflowService {
  async run(
    workflowId: string,
    version: WorkflowVersion,
    page: Page,
    options: Omit<WorkflowRunnerOptions, 'tools'> = {},
  ): Promise<WorkflowRun> {
    // Do not construct the global Operator tool registry here. Apart from
    // coupling the two modes, some factories pull in DOM-dependent code while
    // the service worker is still building the tool list.
    const getPage = () => options.pageRef?.current ?? page;
    const withStablePageRead = async <T>(operation: (currentPage: Page) => Promise<T>): Promise<T> => {
      const currentPage = getPage();
      return retryAfterNavigation(currentPage, () => operation(currentPage));
    };
    preferProvidedPageForTools(page);
    const memoryTool = lookupMemories(getPage());
    const tools: BrowserTool[] = [{
      name: memoryTool.name,
      description: memoryTool.description,
      func: (input: string) => memoryTool.func(input),
    }, {
      name: 'browser_get_active_tab',
      description: 'Get the tab assigned to this workflow run.',
      func: async () => {
        const tabId = options.context?.tabId;
        if (tabId === undefined) throw new Error('Workflow tab ID is unavailable');
        const tab = await chrome.tabs.get(tabId);
        return JSON.stringify({
          id: tab.id,
          windowId: tab.windowId,
          title: tab.title ?? '',
          url: tab.url ?? '',
          active: tab.active,
        });
      },
    }];

    const getStableTitle = async (): Promise<string> => withStablePageRead(currentPage => currentPage.title());

    // Workflow runs may use browser primitives, but must not inherit the
    // full agent registry (database, knowledge graph, or external services).
    const workflowBrowserTools = new Set([
      'browser_navigate', 'browser_wait_for_navigation', 'browser_navigate_back',
      'browser_navigate_forward', 'browser_click', 'browser_type',
      'browser_handle_dialog', 'browser_press_key', 'browser_keyboard_type',
      'browser_query', 'browser_get_title', 'browser_read_text',
      'browser_screenshot', 'browser_snapshot_dom', 'browser_accessible_tree',
      'browser_get_active_tab', 'browser_read_text_ast', 'browser_get_overview',
      'browser_get_section', 'browser_get_summary', 'browser_get_summary_ast',
    ]);
    const workflowOverrides = new Set([
      'browser_get_title', 'browser_read_text', 'browser_read_text_ast',
      'browser_read_text_enhanced', 'browser_get_overview', 'browser_get_section',
      'browser_get_summary', 'browser_get_summary_ast',
    ]);
    for (const candidate of getAllTools(getPage()) as any[]) {
      if (workflowBrowserTools.has(candidate.name)
        && !workflowOverrides.has(candidate.name)
        && !tools.some(tool => tool.name === candidate.name)) {
        tools.push({
          name: candidate.name,
          description: candidate.description,
          func: (input: string) => {
            const currentPage = getPage();
            preferProvidedPageForTools(currentPage);
            const current = (getAllTools(currentPage) as any[]).find(tool => tool.name === candidate.name);
            return current ? current.func(input) : Promise.resolve(`Error: Tool unavailable: ${candidate.name}`);
          },
        });
      }
    }

    const readMain = async (): Promise<string> => withStablePageRead(async currentPage => {
      const selectors = ['main', 'article', '[role="main"]', '#content', '#main', '.content', '.main-content'];
      for (const selector of selectors) {
        const locator = currentPage.locator(selector).first();
        if (await locator.count()) {
          const text = (await locator.innerText()).trim();
          if (text) return text.slice(0, WORKFLOW_MAX_RETURN_CHARS);
        }
      }
      return (await currentPage.locator('body').innerText()).trim().slice(0, WORKFLOW_MAX_RETURN_CHARS);
    });
    const getOverview = async (): Promise<string> => withStablePageRead(async currentPage => {
      const title = await currentPage.title();
      const headings = await currentPage.locator('h1, h2').allInnerTexts();
      const bodyText = await currentPage.locator('body').innerText();
      const wordCount = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;
      return JSON.stringify({
        title,
        url: getPage().url(),
        wordCount,
        estimatedReadingTime: Math.max(1, Math.ceil(wordCount / 200)),
        sections: headings.map((text: string) => text.trim()).filter(Boolean),
      });
    });
    const getSummary = async (input: string): Promise<string> => withStablePageRead(async currentPage => {
      const requestedLength = Number.parseInt(input, 10);
      const maxLength = Number.isFinite(requestedLength) && requestedLength > 0 ? requestedLength : 500;
      const title = await currentPage.title();
      const body = (await currentPage.locator('body').innerText()).trim();
      return `${title}\n\n${body.slice(0, maxLength)}`;
    });

    tools.push({ name: 'browser_read_main_for_workflow', description: 'Workflow-only main content.', func: readMain });
    tools.push({ name: 'browser_get_overview', description: 'Workflow-safe page overview.', func: getOverview });

    for (const name of ['browser_read_text', 'browser_read_text_ast', 'browser_read_text_enhanced']) {
      tools.push({ name, description: `Workflow-safe text reader (${name}).`, func: readMain });
    }
    for (const name of ['browser_get_summary', 'browser_get_summary_ast']) {
      tools.push({ name, description: `Workflow-safe page summary (${name}).`, func: getSummary });
    }
    tools.push({
      name: 'browser_get_title',
      description: 'Workflow-safe page title.',
      func: getStableTitle,
    });
    tools.push({
      name: 'browser_extract_structured',
      description: 'Extract user-confirmed fields from a table, semantic list, or repeated cards into standard JSON.',
      func: async (input: string) => withStablePageRead(async currentPage => {
        const request = extractionRequestSchema.parse(parseToolInput(input));
        const candidates = ['table tbody tr', 'table tr', '[role="grid"] [role="row"]', '[role="list"] > [role="listitem"]', 'ul > li', 'ol > li', 'main article', '[class*="card"]'];
        let selector = request.plan?.itemSelector ?? request.plan?.listSelector ?? '';
        if (selector && await currentPage.locator(selector).count() < 2) throw new Error('Saved extraction plan no longer matches at least two records; reconfigure the extraction');
        if (!selector) for (const candidate of candidates) { if (await currentPage.locator(candidate).count() >= 2) { selector = candidate; break; } }
        const warnings: string[] = [];
        if (!selector) warnings.push('No repeated table, list, or card structure was found');
        const locator = selector ? currentPage.locator(selector) : currentPage.locator('body');
        const count = Math.min(await locator.count(), request.maxRows);
        const values: Array<Record<string, unknown>> = [];
        for (let index = selector === 'table tr' ? 1 : 0; index < count; index += 1) {
          const item = locator.nth(index);
          const cells = selector.startsWith('table') ? await item.locator('th,td').allInnerTexts() : [];
          const text = (await item.innerText()).trim();
          const parts = cells.length ? cells : text.split(/\s{2,}|\t|\n/).map(value => value.trim()).filter(Boolean);
          const entries: Array<[string, unknown]> = [];
          for (let fieldIndex = 0; fieldIndex < request.fields.length; fieldIndex += 1) {
            const field = request.fields[fieldIndex];
            const planned = request.plan?.fields.find(candidate => candidate.name === field.key || candidate.name === field.label);
            let value: unknown = parts[planned?.column ?? fieldIndex] ?? null;
            if (planned?.selector) { const target = item.locator(planned.selector).first(); value = await target.count() ? (field.type === 'url' ? await target.getAttribute('href') : await target.innerText()) : null; }
            entries.push([field.key, value]);
          }
          values.push(Object.fromEntries(entries));
        }
        if ((await locator.count()) > request.maxRows) warnings.push(`Result limited to ${request.maxRows} rows`);
        const unique = [...new Map(values.map(row => [JSON.stringify(row), row])).values()];
        if (unique.length < values.length) warnings.push(`${values.length - unique.length} duplicate records were removed`);
        const result = validateExtractionResult({ fields: request.fields, rows: unique, sourceUrls: [currentPage.url()], warnings, generatedAt: new Date().toISOString(), plan: request.plan });
        if (request.plan && (result.completeness ?? 0) < 0.8) throw new Error('Saved extraction plan field coverage fell below 80%; reconfigure the extraction');
        return JSON.stringify(result);
      }),
    });
    tools.push({
      name: 'browser_export_data',
      description: 'Download a standard structured extraction result as JSON or CSV.',
      func: async (input: string) => {
        const payload = parseToolInput(input) as any;
        if (!Array.isArray(payload.fields) || !Array.isArray(payload.rows)) throw new Error('browser_export_data requires a standard extraction result');
        const format = payload.format ?? 'json';
        if (format !== 'json' && format !== 'csv') throw new Error('browser_export_data format must be json or csv');
        const result = validateExtractionResult({ ...payload, sourceUrls: payload.sourceUrls ?? [], warnings: payload.warnings ?? [], generatedAt: payload.generatedAt ?? new Date().toISOString() });
        const content = format === 'json' ? toJson(result) : toCsv(result);
        const encoded = btoa(unescape(encodeURIComponent(content)));
        const downloadId = await chrome.downloads.download({ url: `data:${format === 'json' ? 'application/json' : 'text/csv'};base64,${encoded}`, filename: `browseronly-extraction-${Date.now()}.${format}`, saveAs: true });
        return JSON.stringify({ downloadId, format, rows: result.rows.length });
      },
    });
    tools.push({
      name: 'browser_get_section',
      description: 'Workflow-safe section lookup.',
      func: async (sectionName: string) => {
        const body = await readMain();
        const index = body.toLocaleLowerCase().indexOf(sectionName.trim().toLocaleLowerCase());
        return index < 0 ? `Section "${sectionName}" not found.` : body.slice(index, index + 4_000);
      },
    });

    tools.push(createOfficeInspectionTool(() => options.context?.tabId, workflowId));
    const registeredNames = new Set(tools.map(tool => tool.name));
    const unsupportedTools = [...new Set(version.steps
      .filter(step => step.enabled && step.toolName && !registeredNames.has(step.toolName))
      .map(step => step.toolName as string))];
    if (unsupportedTools.length) {
      throw new Error(`Unsupported workflow tools: ${unsupportedTools.join(', ')}`);
    }

    const repairedSelectors = new Map<string, string>();
    const run = await (options.runner ?? new WorkflowRunner()).run(workflowId, version, {
      ...options,
      tools,
      executeReplay: (step, input, signal) => executeReplayStep(getPage(), step, input, signal),
      repairQuery: async (step, failedSelector) => {
        try {
          const config = await ConfigManager.getInstance().getProviderConfig();
          if (!config.apiKey && config.provider !== 'ollama') return undefined;
          const provider = await createProvider(config.provider, {
            apiKey: config.apiKey || 'dummy-key-for-ollama', apiModelId: config.apiModelId,
            baseUrl: config.baseUrl, thinkingBudgetTokens: config.thinkingBudgetTokens,
            openaiCompatibleModels: config.openaiCompatibleModels,
          });
          const proposal = await proposeQuerySelector(provider, step, failedSelector.split('|', 1)[0], getPage(), version.taskInstruction);
          if (!proposal) return undefined;
          const target = getPage().locator(proposal.selector);
          const count = await target.count();
          if (count < 1 || (step.toolName !== 'browser_query' && count !== 1)) return undefined;
          if (!(await target.first().innerText()).includes(proposal.evidenceText) && !(await target.first().getAttribute('aria-label'))?.includes(proposal.evidenceText)) return undefined;
          const suffix = step.toolName === 'browser_type' ? failedSelector.slice(failedSelector.indexOf('|')) : '';
          if (step.toolName === 'browser_type' && !failedSelector.includes('|')) return undefined;
          const repaired = proposal.selector + suffix;
          repairedSelectors.set(step.id, repaired);
          return repaired;
        } catch (error) {
          console.warn('[WorkflowService] query repair unavailable', error);
          return undefined;
        }
      },
    });
    if (run.status === 'succeeded' && repairedSelectors.size) {
      const store = WorkflowStore.getInstance();
      const next = {
        ...version, id: `version-${crypto.randomUUID()}`, version: version.version + 1,
        source: 'ai_repair' as const, sourceRunId: run.id, suggestedFromRunId: version.replayFormat === 'steps-v2' ? run.id : undefined, createdAt: Date.now(),
        steps: version.steps.map(step => repairedSelectors.has(step.id)
          ? { ...step, input: repairedSelectors.get(step.id), locator: { css: repairedSelectors.get(step.id)!.split('|', 1)[0], fallbackOrder: ['css' as const] } } : step),
      };
      await store.saveVersion(next);
      const workflow = await store.getWorkflow(workflowId);
      if (version.replayFormat === 'steps-v2') { run.suggestedVersionId = next.id; await store.saveRun(run); }
      else if (workflow) await store.saveWorkflow({ ...workflow, activeVersionId: next.id, updatedAt: Date.now() });
    }
    return run;
  }
}

function parseToolInput(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  return trimmed ? JSON.parse(trimmed) : {};
}
