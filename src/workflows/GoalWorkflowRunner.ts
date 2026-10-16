import type { Page } from 'playwright-crx';
import { createBrowserAgent } from '../agent/AgentCore';
import type { ExecutionCallbacks } from '../agent/ExecutionEngine';
import { cancelRunApprovals } from '../agent/approvalManager';
import { WorkflowStore } from './WorkflowStore';
import { redactValue } from './TraceRecorder';
import type { Workflow, WorkflowRun, WorkflowVersion } from './types';

type GoalAgent = Awaited<ReturnType<typeof createBrowserAgent>>;
interface Options {
  variables?: Record<string, unknown>;
  context: { tabId: number; ownerTabId: number; windowId: number; scheduled?: boolean };
  onOutput: (type: 'llm' | 'system', content: string, runId: string) => void;
}

/** Each goal run uses a fresh agent and history, and never replays recorded steps. */
export class GoalWorkflowRunner {
  currentRunId?: string;
  private agent?: GoalAgent;
  private cancelled = false;
  constructor(
    private readonly store = WorkflowStore.getInstance(),
    private readonly createAgent = createBrowserAgent,
  ) {}

  cancel(): void {
    this.cancelled = true;
    this.agent?.cancel();
    if (this.currentRunId) cancelRunApprovals(this.currentRunId);
  }

  async run(workflow: Workflow, version: WorkflowVersion, page: Page, options: Options): Promise<WorkflowRun> {
    const run: WorkflowRun = {
      id: `run-${crypto.randomUUID()}`, workflowId: workflow.id, versionId: version.id,
      source: options.context.scheduled ? 'schedule' : 'manual', status: 'running', startedAt: Date.now(), llmCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0,
      ownerTabId: options.context.ownerTabId, executionTabId: options.context.tabId,
      executionWindowId: options.context.windowId, verification: 'unverified',
    };
    this.currentRunId = run.id;
    await this.store.saveRun(run);
    const pending: Promise<unknown>[] = [];
    let sequence = 0;
    const record = (kind: 'execute' | 'failure', message: string) => {
      const index = sequence++;
      pending.push(this.store.saveTraceEvent({ id: `${run.id}-${index}`, runId: run.id, sequence: index, kind,
        message: String(redactValue(message)), timestamp: Date.now(),
      }).catch(() => { run.traceIncomplete = true; }));
    };
    try {
      if (!version.taskInstruction?.trim()) throw new Error('Enter a task goal before using Explore by goal.');
      const values = Object.fromEntries(workflow.variables.map(variable => [variable.key, variable.type === 'secret' ? undefined : variable.defaultValue]));
      Object.assign(values, options.variables);
      const prompt = version.taskInstruction.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
        if (values[key] === undefined || values[key] === '') throw new Error(`Missing task input: ${key}`);
        return String(values[key]);
      });
      this.agent = await this.createAgent(page, '');
      if (this.cancelled) { run.status = 'cancelled'; return run; }
      if (version.entryContext?.kind !== 'standalone') {
        this.agent.promptManager.setCurrentPageContext(page.url(), await page.title());
      }
      if (this.cancelled) { run.status = 'cancelled'; return run; }
      const callbacks: ExecutionCallbacks = {
        executionContext: { ...options.context, runId: run.id, workflowId: workflow.id },
        onLlmOutput: content => options.onOutput('llm', content, run.id),
        onToolOutput: content => options.onOutput('system', content, run.id),
        onComplete: () => {},
        onModelUsage: (input, output) => { run.llmCalls++; run.inputTokens += input; run.outputTokens += output; },
        onExecutionEnd: (status, error) => {
          run.status = status === 'completed' ? 'succeeded' : status === 'cancelled' ? 'cancelled' : 'failed';
          run.failureMessage = error;
        },
        onToolEvent: event => {
          const index = sequence;
          const sensitive = event.toolName === 'browser_type' && /password|passwd|secret|token|cvv|card/i.test(String(event.input).split('|', 1)[0]);
          record(event.result?.ok === false ? 'failure' : 'execute', JSON.stringify({ tool: event.toolName, input: sensitive ? '[REDACTED]' : redactValue(event.input), error: event.result?.error?.message }));
          pending.push(this.store.saveStepRun({ id: `${run.id}-step-${index}`, runId: run.id,
            stepId: event.executionId, status: event.result?.ok === false ? 'failed' : 'succeeded',
            startedAt: event.startedAt, endedAt: event.endedAt, errorMessage: event.result?.error?.message,
          }).catch(() => { run.traceIncomplete = true; }));
        },
      };
      await this.agent.executePromptWithFallback(prompt, callbacks, [], 'operator');
      if (this.cancelled) run.status = 'cancelled';
      if (run.status === 'running') throw new Error('The agent ended without reporting an execution outcome.');
    } catch (error) {
      run.status = this.cancelled ? 'cancelled' : 'failed';
      run.failureMessage = error instanceof Error ? error.message : String(error);
      record('failure', run.failureMessage);
    } finally {
      await Promise.all(pending);
      run.endedAt = Date.now();
      await this.store.saveRun(run);
      this.agent = undefined;
    }
    return run;
  }
}
