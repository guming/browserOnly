// Imported only by Vite's benchmark build. No external messages or HTTP endpoint.
import { createBrowserAgent, type BrowserAgent } from '../agent/AgentCore';
import type { ExecutionOutcome } from '../agent/ExecutionOutcome';
import { getCurrentPage, resetPageContext } from '../agent/PageContextManager';
import { cancelRunApprovals } from '../agent/approvalManager';
import { captureScreenshot } from '../agent/tools/captureScreenshot';
import type { ProviderConfig } from '../background/configManager';
import { createWorkflowExecutionTab } from '../background/tabManager';
import { acquireWindowTaskLease, releaseWindowTaskLease } from '../background/windowTaskLease';
import { redactValue } from '../workflows/TraceRecorder';
import { StepRecorder, type StepTiming } from './StepRecorder';
import { readPageEvidence } from './pageEvidence';

interface Input { runId: string; jobId: string; startUrl: string; prompt: string; timeoutSeconds: number; config: ProviderConfig; }
interface Evidence { at: string; url?: string; kind: string; [key: string]: unknown; }
interface RecordState {
  runId: string; jobId: string; status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string; endedAt?: string; answer: string; outputs: string[]; events: Evidence[];
  toolCalls: number; inputTokens: number; outputTokens: number; outcome?: ExecutionOutcome;
  reason?: string; evidenceErrors: string[];
  steps: StepTiming[];
  evidenceDurationMs: number;
}
let state: RecordState | undefined;
let agent: BrowserAgent | undefined;
let busy = false;
let stopReason: string | undefined;
let recorder = new StepRecorder();
let pendingWrite: Promise<void> = Promise.resolve();
let checkpointTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePersist() {
  if (checkpointTimer) return;
  checkpointTimer = setTimeout(() => {
    checkpointTimer = undefined;
    pendingWrite = pendingWrite.then(() => persist());
  }, 250);
}

const now = () => new Date().toISOString();
const safe = (value: unknown) => {
  const text = JSON.stringify(redactValue(value));
  return text.length > 20000 ? { truncated: true, excerpt: text.slice(0, 20000) } : JSON.parse(text);
};
async function persist() {
  if (!state) return;
  try { await chrome.storage.local.set({ benchmarkRun: state }); }
  catch { state.evidenceErrors.push('EVIDENCE_PERSIST_FAILED'); }
}
async function capture(page: any, kind: string, screenshot = false) {
  if (!state) return;
  const clock = performance.now();
  try {
    const active = getCurrentPage(page);
    const content = await active.evaluate(readPageEvidence);
    state.events.push({ at: now(), kind, url: active.url(), content: redactValue(content) });
    if (screenshot) {
      const bytes = await captureScreenshot(active, { type: 'png', timeout: 5000 });
      if (bytes.length > 1_000_000) state.evidenceErrors.push('SCREENSHOT_TOO_LARGE');
      else {
        let binary = '';
        for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
        state.events.push({ at: now(), kind: 'screenshot', url: active.url(), pngBase64: btoa(binary) });
      }
    }
  } catch (error) { state.evidenceErrors.push(`CAPTURE_FAILED: ${String(error)}`); }
  finally { state.evidenceDurationMs += performance.now() - clock; }
}
function cancel(runId: string, reason = 'CANCELLED') {
  if (state?.runId !== runId || !busy) return false;
  stopReason = reason;
  agent?.cancel();
  cancelRunApprovals(runId);
  return true;
}
async function execute(input: Input) {
  let windowId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const prefix = input.config.provider === 'openai-compatible' ? 'openaiCompatible' : input.config.provider;
    // Sub-agents/read tools use ConfigManager as well as the parent Agent.
    // This storage belongs to the runner's disposable Profile only.
    await chrome.storage.sync.set({ provider: input.config.provider,
      [`${prefix}ApiKey`]: input.config.apiKey,
      [`${prefix}ModelId`]: input.config.apiModelId,
      ...(input.config.baseUrl ? { [`${prefix}BaseUrl`]: input.config.baseUrl } : {}),
    });
    // A separate window plus a fresh browser per job isolates tabs and local memory.
    const window = await chrome.windows.create({ url: 'about:blank', focused: true });
    windowId = window.id;
    if (windowId === undefined || !acquireWindowTaskLease(windowId)) throw new Error('WINDOW_LEASE_FAILED');
    timer = setTimeout(() => cancel(input.runId, 'TIMEOUT'), input.timeoutSeconds * 1000);
    const execution = await createWorkflowExecutionTab(windowId, input.startUrl);
    resetPageContext();
    await capture(execution.page, 'initial', true);
    if (stopReason) return;
    agent = await createBrowserAgent(execution.page, '', input.config, { memory: false });
    agent.promptManager.setCurrentPageContext(input.startUrl, await execution.page.title());
    if (stopReason) { agent.cancel(); return; }
    await agent.executePromptWithFallback(input.prompt, {
      executionContext: { runId: input.runId, workflowId: 'benchmark', tabId: execution.tabId,
        ownerTabId: execution.tabId, windowId, scheduled: true },
      onLlmOutput: content => { state!.outputs.push(String(redactValue(content))); },
      onToolOutput: () => {},
      onComplete: () => {},
      onExecutionOutcome: outcome => { state!.outcome = outcome; },
      onExecutionEnd: (status, error) => { state!.status = status; if (error) state!.reason = String(redactValue(error)); },
      onModelUsage: (inputTokens, outputTokens) => { state!.inputTokens += inputTokens; state!.outputTokens += outputTokens; },
      onToolExecutionStart: event => {
        recorder.start(event);
        state!.toolCalls = recorder.steps.length;
        schedulePersist();
      },
      onToolExecutionEnd: event => { recorder.finish(event); schedulePersist(); },
      onToolEvent: async event => {
        state!.events.push({ at: now(), kind: 'tool', trace: safe(event) });
        await capture(execution.page, 'after-tool');
        schedulePersist();
      },
    }, [], 'operator');
    state!.answer = String(redactValue(state!.outcome?.message || state!.outputs.at(-1) || ''));
    await capture(execution.page, 'final', true);
  } catch (error) {
    state!.status = 'failed';
    state!.reason = String(redactValue(String(error)));
  } finally {
    if (timer) clearTimeout(timer);
    if (stopReason) { state!.status = stopReason === 'TIMEOUT' ? 'failed' : 'cancelled'; state!.reason = stopReason; }
    if (state!.status === 'running') { state!.status = 'failed'; state!.reason = 'NO_EXECUTION_OUTCOME'; }
    state!.endedAt = now();
    recorder.interrupt(!!stopReason);
    if (checkpointTimer) { clearTimeout(checkpointTimer); checkpointTimer = undefined; }
    await pendingWrite;
    await persist();
    if (windowId !== undefined) {
      releaseWindowTaskLease(windowId);
      await chrome.windows.remove(windowId).catch(() => undefined);
    }
    agent = undefined;
    busy = false;
  }
}

const bridge = {
  version: 1,
  async probe(url: string) {
    if (new URL(url).hostname !== '127.0.0.1') throw new Error('PROBE_LOCALHOST_ONLY');
    if (busy) throw new Error('BENCHMARK_BUSY');
    const window = await chrome.windows.create({ url: 'about:blank' });
    if (window.id === undefined) throw new Error('WINDOW_CREATE_FAILED');
    try {
      const execution = await createWorkflowExecutionTab(window.id, url);
      return await execution.page.evaluate(() => ({ title: document.title, text: document.body.innerText }));
    } finally { await chrome.windows.remove(window.id).catch(() => undefined); }
  },
  async start(input: Input) {
    if (busy) throw new Error('BENCHMARK_BUSY');
    if (!input.runId || !input.prompt || !/^https?:$/.test(new URL(input.startUrl).protocol)) throw new Error('INVALID_INPUT');
    if (!Number.isInteger(input.timeoutSeconds) || input.timeoutSeconds < 1 || input.timeoutSeconds > 300) throw new Error('INVALID_TIMEOUT');
    if (!input.config?.apiModelId || (!input.config.apiKey && input.config.provider !== 'ollama')) throw new Error('MODEL_CONFIG_REQUIRED');
    busy = true;
    stopReason = undefined;
    recorder = new StepRecorder();
    state = { runId: input.runId, jobId: input.jobId, status: 'running', startedAt: now(), answer: '', outputs: [], events: [],
      toolCalls: 0, inputTokens: 0, outputTokens: 0, evidenceErrors: [], steps: recorder.steps, evidenceDurationMs: 0 };
    await persist();
    void execute(input);
    return input.runId;
  },
  async status(runId: string) {
    if (state?.runId !== runId) {
      const saved = (await chrome.storage.local.get('benchmarkRun')).benchmarkRun as RecordState | undefined;
      if (saved?.runId === runId) return { status: 'interrupted', busy: false, toolCalls: saved.toolCalls };
      throw new Error('RUN_NOT_FOUND');
    }
    return { status: state.status, busy, toolCalls: state.toolCalls };
  },
  async result(runId: string) {
    if (state?.runId === runId) return state;
    const saved = (await chrome.storage.local.get('benchmarkRun')).benchmarkRun as RecordState | undefined;
    if (saved?.runId !== runId) throw new Error('RUN_NOT_FOUND');
    return { ...saved, steps: saved.steps?.map(step => step.status === 'running' ? { ...step, status: 'interrupted' } : step), status: 'interrupted', reason: 'SERVICE_WORKER_RESTARTED', endedAt: now() };
  },
  cancel,
};
(globalThis as any).__browserOnlyBenchmark = bridge;
