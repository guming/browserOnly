import type { Page } from 'playwright-crx';
import type { BrowserTool } from '../agent/tools/types';
import { lookupMemories } from '../agent/tools/memoryTools';
import { WorkflowRunner, WorkflowRunnerOptions } from './WorkflowRunner';
import type { WorkflowRun, WorkflowVersion } from './types';

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
    const memoryTool = lookupMemories(page);
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

    const readMain = async (): Promise<string> => {
      const selectors = ['main', 'article', '[role="main"]', '#content', '#main', '.content', '.main-content'];
      for (const selector of selectors) {
        const locator = page.locator(selector).first();
        if (await locator.count()) {
          const text = (await locator.innerText()).trim();
          if (text) return text.slice(0, WORKFLOW_MAX_RETURN_CHARS);
        }
      }
      return (await page.locator('body').innerText()).trim().slice(0, WORKFLOW_MAX_RETURN_CHARS);
    };
    const getOverview = async (): Promise<string> => {
      const title = await page.title();
      const headings = await page.locator('h1, h2').allInnerTexts();
      const bodyText = await page.locator('body').innerText();
      const wordCount = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;
      return JSON.stringify({
        title,
        url: page.url(),
        wordCount,
        estimatedReadingTime: Math.max(1, Math.ceil(wordCount / 200)),
        sections: headings.map(text => text.trim()).filter(Boolean),
      });
    };
    const getSummary = async (input: string): Promise<string> => {
      const requestedLength = Number.parseInt(input, 10);
      const maxLength = Number.isFinite(requestedLength) && requestedLength > 0 ? requestedLength : 500;
      return `${await page.title()}\n\n${(await readMain()).slice(0, maxLength)}`;
    };

    tools.push({ name: 'browser_read_main_for_workflow', description: 'Workflow-only main content.', func: readMain });
    tools.push({ name: 'browser_get_overview', description: 'Workflow-safe page overview.', func: getOverview });

    for (const name of ['browser_read_text', 'browser_read_text_ast', 'browser_read_text_enhanced']) {
      tools.push({ name, description: `Workflow-safe text reader (${name}).`, func: readMain });
    }
    for (const name of ['browser_get_summary', 'browser_get_summary_ast']) {
      tools.push({ name, description: `Workflow-safe page summary (${name}).`, func: getSummary });
    }
    tools.push({ name: 'browser_get_title', description: 'Workflow-safe page title.', func: async () => page.title() });
    tools.push({
      name: 'browser_get_section',
      description: 'Workflow-safe section lookup.',
      func: async (sectionName: string) => {
        const body = await readMain();
        const index = body.toLocaleLowerCase().indexOf(sectionName.trim().toLocaleLowerCase());
        return index < 0 ? `Section "${sectionName}" not found.` : body.slice(index, index + 4_000);
      },
    });

    const registeredNames = new Set(tools.map(tool => tool.name));
    const unsupportedTools = [...new Set(version.steps
      .filter(step => step.enabled && step.toolName && !registeredNames.has(step.toolName))
      .map(step => step.toolName as string))];
    if (unsupportedTools.length) {
      throw new Error(`Unsupported workflow tools: ${unsupportedTools.join(', ')}`);
    }

    return new WorkflowRunner().run(workflowId, version, { ...options, tools });
  }
}
