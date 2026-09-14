import { handleApprovalResponse } from '../agent/approvalManager';
import { createProvider }  from '../models/providers/factory';
import { TokenTrackingService } from '../tracking/tokenTrackingService';
import { executePrompt } from './agentController';
import { cancelExecution } from './agentController';
import { clearMessageHistory } from './agentController';
import { initializeAgent } from './agentController';
import { ConfigManager } from './configManager';
import { triggerReflection } from './reflectionController';
import { attachToTab, createWorkflowExecutionTab, getTabState, getWindowForTab, forceResetPlaywright } from './tabManager';
import { BackgroundMessage, DownloadMarkdownMessage } from './types';
import { logWithTimestamp, handleError, sendUIMessage } from './utils';
import { SimpleChatAgent } from '../agent/SimpleChatAgent';
import { WorkflowStore } from '../workflows/WorkflowStore';
import { WorkflowService } from '../workflows/WorkflowService';
import { WorkflowRunner } from '../workflows/WorkflowRunner';
import { translateBatch } from '../translation/translationService';
import { TranslationQueue } from '../translation/translationQueue';
import { createPageTranslationStartMessage, deliverTranslationBatchResult, sendToTranslationContentScript } from '../translation/translationContentScript';
const translationQueue = new TranslationQueue((request, signal) => translateBatch(request, signal));
const activeTranslationSessions = new Map<number, string>();

const workflowRunners = new Map<string, { runner: WorkflowRunner; executionTabId?: number; ownerTabId: number; context?: { tabId?: number; windowId?: number; ownerTabId?: number; cancelReason?: string } }>();
const workflowRunByExecutionTab = new Map<number, WorkflowRunner>();
/**
 * Handle messages from the UI
 * @param message The message to handle
 * @param sender The sender of the message
 * @param sendResponse The function to send a response
 * @returns True if the message was handled, false otherwise
 */
export function handleMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): boolean {
  try {
    // Type guard to check if the message is a valid background message
    if (!isBackgroundMessage(message)) {
      logWithTimestamp(`Ignoring unknown message type: ${JSON.stringify(message)}`, 'warn');
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
    }

    // Handle the message based on its action
    switch (message.action) {
      case 'executePrompt':
        handleExecutePrompt(message, sendResponse);
        return true; // Keep the message channel open for async response

      case 'runWorkflow':
        handleRunWorkflow(message, sendResponse).catch(error => sendResponse({ success: false, error: String(error) }));
        return true;

      case 'cancelExecution':
        handleCancelExecution(message, sendResponse);
        return true;

      case 'cancelWorkflow':
        workflowRunners.get(message.runId)?.runner.cancel();
        sendResponse({ success: true });
        return true;

      case 'clearHistory':
        // Handle async function and keep message channel open
        handleClearHistory(message, sendResponse)
          .catch(error => {
            const errorMessage = handleError(error, 'clearing history');
            logWithTimestamp(`Error in async handleClearHistory: ${errorMessage}`, 'error');
            sendResponse({ success: false, error: errorMessage });
          });
        return true; // Keep the message channel open for async response

      case 'initializeTab':
        // This function uses setTimeout internally to handle async operations
        // We still return true to keep the message channel open
        handleInitializeTab(message, sendResponse);
        return true; // Keep the message channel open for async response
        
      case 'switchToTab':
        handleSwitchToTab(message, sendResponse).catch(error => {
          sendResponse({ success: false, error: String(error) });
        });
        return true;

      case 'refreshTab':
        handleRefreshTab(message, sendResponse).catch(error => {
          sendResponse({ success: false, error: String(error) });
        });
        return true;
        
      case 'getTokenUsage':
        handleGetTokenUsage(message, sendResponse);
        return true;
        
      case 'approvalResponse':
        handleApprovalResponse(message.requestId, message.approved, message.runId);
        sendResponse({ success: true });
        return true;
        
      case 'reflectAndLearn':
        handleReflectAndLearn(message, sendResponse);
        return true;
        
      case 'tokenUsageUpdated':
        // Just pass through token usage updates
        // This allows the TokenTrackingService to broadcast updates
        // that will be received by all UI components
        sendResponse({ success: true });
        return true;
        
      case 'updateOutput':
        // Just pass through output updates
        // This allows components to send UI updates
        sendResponse({ success: true });
        return true;
        
      case 'providerConfigChanged':
        // Just pass through provider configuration change notifications
        // This allows the ProviderSelector component to refresh
        sendResponse({ success: true });
        return true;
        
      case 'forceResetPlaywright':
        // Handle async function and keep message channel open
        handleForceResetPlaywright(message, sendResponse)
          .catch(error => {
            const errorMessage = handleError(error, 'force resetting Playwright');
            logWithTimestamp(`Error in async handleForceResetPlaywright: ${errorMessage}`, 'error');
            sendResponse({ success: false, error: errorMessage });
          });
        return true; // Keep the message channel open for async response
        
      case 'requestApproval':
        // Just acknowledge receipt of the request approval message
        // The actual approval handling is done by the UI
        sendResponse({ success: true });
        return true;
        
      case 'checkAgentStatus':
        // Handle async function and keep message channel open
        handleCheckAgentStatus(message, sendResponse)
          .catch(error => {
            const errorMessage = handleError(error, 'checking agent status');
            logWithTimestamp(`Error in async handleCheckAgentStatus: ${errorMessage}`, 'error');
            sendResponse({ success: false, error: errorMessage });
          });
        return true; // Keep the message channel open for async response
      case 'download-markdown':
          console.log('download message is', message.filename)
          handleDownloadMarkdown(message);
          sendResponse({ success: true });
          return false;

      case 'togglePdfInterception':
        handleTogglePdfInterception(message, sendResponse);
        return true;

      case 'checkPdfUrl':
        handleCheckPdfUrl(message, sendResponse);
        return true;

      case 'fetchPdfAsBlob':
        handleFetchPdfAsBlob(message, sendResponse);
        return true;

      case 'pdfAiChat':
        handlePdfAiChat(message, sendResponse)
          .catch(error => {
            const errorMessage = handleError(error, 'handling PDF AI chat');
            logWithTimestamp(`Error in async handlePdfAiChat: ${errorMessage}`, 'error');
            sendResponse({ success: false, error: errorMessage });
          });
        return true; // Keep the message channel open for async response

      case 'translatePage':
        handlePageTranslation(message, sendResponse);
        return true;
      case 'stopPageTranslation':
        if (typeof message.tabId === 'number') {
          const pageSessionId = message.pageSessionId || activeTranslationSessions.get(message.tabId);
          if (pageSessionId) translationQueue.cancel(pageSessionId);
          activeTranslationSessions.delete(message.tabId);
          Promise.resolve(chrome.tabs.sendMessage(message.tabId, { action: 'stopPageTranslation', pageSessionId, requestId: message.requestId })).catch(() => {});
        }
        sendResponse({ success: true });
        return true;
      case 'setTranslationMode':
        if (typeof message.tabId === 'number') Promise.resolve(chrome.tabs.sendMessage(message.tabId, message)).catch(() => {});
        sendResponse({ success: true });
        return true;
      case 'translationBatch':
        handleTranslationBatch(message, sender, sendResponse);
        return true;
      case 'translateSelection':
        handleSelectionTranslation(message, sender, sendResponse);
        return true;
      case 'translationCapability':
        sendResponse({ success: true, chromeTranslator: typeof (globalThis as any).Translator !== 'undefined', ollama: true, configuredProvider: true });
        return true;

      default:
        // This should never happen due to the type guard, but TypeScript requires it
        logWithTimestamp(`Unhandled message action: ${(message as any).action}`, 'warn');
        sendResponse({ success: false, error: 'Unhandled message action' });
        return false;
    }
  } catch (error) {
    const errorMessage = handleError(error, 'handling message');
    logWithTimestamp(`Error handling message: ${errorMessage}`, 'error');
    sendResponse({ success: false, error: errorMessage });
    return false;
  }
}

function handleDownloadMarkdown(message: DownloadMarkdownMessage) {
  try {
    const blob = new Blob([message.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url,
      filename: message.filename,
      saveAs: true,
    });
  } catch (error) {
    const errorMessage = handleError(error, 'handleDownloadMarkdown message');
    logWithTimestamp(`Error handleDownloadMarkdown message: ${errorMessage}`, 'error');
  }
  
}

/**
 * Type guard to check if a message is a valid background message
 * @param message The message to check
 * @returns True if the message is a valid background message, false otherwise
 */
function isBackgroundMessage(message: any): message is BackgroundMessage {
  return (
    message &&
    typeof message === 'object' &&
    'action' in message &&
    (
      message.action === 'executePrompt' ||
      message.action === 'runWorkflow' ||
      message.action === 'cancelExecution' ||
      message.action === 'cancelWorkflow' ||
      message.action === 'clearHistory' ||
      message.action === 'initializeTab' ||
      message.action === 'switchToTab' ||
      message.action === 'getTokenUsage' ||
      message.action === 'approvalResponse' ||
      message.action === 'reflectAndLearn' ||
      message.action === 'tokenUsageUpdated' ||  // Add support for token usage updates
      message.action === 'updateOutput' ||  // Add support for output updates
      message.action === 'providerConfigChanged' ||  // Add support for provider config changes
      message.action === 'tabStatusChanged' ||
      message.action === 'targetCreated' ||
      message.action === 'targetDestroyed' ||
      message.action === 'targetChanged' ||
      message.action === 'tabTitleChanged' ||
      message.action === 'pageDialog' ||
      message.action === 'pageConsole' ||
      message.action === 'pageError' ||
      message.action === 'forceResetPlaywright' ||
      message.action === 'requestApproval' ||  // Add support for request approval messages
      message.action === 'checkAgentStatus' || // Add support for agent status check
      message.action === 'download-markdown' ||
      message.action === 'togglePdfInterception' ||
      message.action === 'checkPdfUrl' ||
      message.action === 'fetchPdfAsBlob' ||
      message.action === 'pdfAiChat'
      || message.action === 'translatePage'
      || message.action === 'stopPageTranslation'
      || message.action === 'setTranslationMode'
      || message.action === 'translateSelection'
      || message.action === 'translationBatch'
      || message.action === 'translationBatchResult'
      || message.action === 'translationStatus'
      || message.action === 'translationCapability'
    )
  );
}

async function handlePageTranslation(message: any, sendResponse: (response?: any)=>void) {
  const tabId=message.tabId; if(typeof tabId!=='number') { sendResponse({success:false,error:'tabId required'}); return; }
  const pageSessionId=message.pageSessionId || `${tabId}-${Date.now()}`;
  const previousSessionId = activeTranslationSessions.get(tabId);
  if (previousSessionId && previousSessionId !== pageSessionId) translationQueue.cancel(previousSessionId);
  console.info('[translation][background] translatePage received', { tabId, pageSessionId, mode: message.mode });
  try {
    const settings = await ConfigManager.getInstance().getTranslationSettings();
    console.info('[translation][background] settings loaded', { targetLanguage: message.targetLanguage || settings.targetLanguage, translateTitle: message.translateTitle ?? settings.translateTitle });
    await sendToTranslationContentScript(tabId, createPageTranslationStartMessage(message, settings, pageSessionId));
    activeTranslationSessions.set(tabId, pageSessionId);
    console.info('[translation][background] start sent to content script', { tabId, pageSessionId });
    sendResponse({success:true,pageSessionId});
  } catch (error) {
    sendResponse({success:false,error:String(error)});
  }
}
async function handleTranslationBatch(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
  const tabId=message.tabId ?? sender.tab?.id; if(typeof tabId!=='number') return;
  console.info('[translation][background] batch received', { tabId, pageSessionId: message.pageSessionId, requestId: message.requestId, units: message.units?.length, targetLanguage: message.targetLanguage });
  try {
    const results=await translationQueue.enqueue({...message, tabId});
    console.info('[translation][background] batch completed', { tabId, pageSessionId: message.pageSessionId, requestId: message.requestId, results: results.length });
    await deliverTranslationBatchResult(tabId, message, results);
    console.info('[translation][background] batch delivered', { tabId, pageSessionId: message.pageSessionId, requestId: message.requestId, results: results.length });
    sendResponse({success:true,pageSessionId:message.pageSessionId,requestId:message.requestId,results});
  }
  catch(error) {
    console.error('[translation][background] batch failed', { tabId, pageSessionId:message.pageSessionId, requestId:message.requestId, error: String(error) });
    sendResponse({success:false,pageSessionId:message.pageSessionId,requestId:message.requestId,error:String(error)});
  }
}
export async function translateSelectionForTab(tabId: number, message: any): Promise<void> {
  try {
    const result=await translateBatch({...message,tabId,pageSessionId:message.pageSessionId || `selection-${tabId}`,units:[{sourceId:message.sourceId||'selection',text:message.text,kind:'selection'}]});
    await sendToTranslationContentScript(tabId,{action:'translationSelectionResult',requestId:message.requestId,translatedText:result[0]?.translatedText||''});
  } catch(error) {
    await sendToTranslationContentScript(tabId,{action:'translationSelectionResult',requestId:message.requestId,error:String(error)}).catch(()=>{});
  }
}
async function handleSelectionTranslation(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  const tabId=message.tabId ?? sender.tab?.id;
  if(typeof tabId!=='number') {
    sendResponse({ success: false, error: 'tabId required' });
    return;
  }
  try {
    const settings = await ConfigManager.getInstance().getTranslationSettings();
    await translateSelectionForTab(tabId, {...message,targetLanguage:message.targetLanguage || settings.targetLanguage});
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: String(error) });
  }
}

async function handleRunWorkflow(
  message: Extract<BackgroundMessage, { action: 'runWorkflow' }>,
  sendResponse: (response?: any) => void
): Promise<void> {
  let tabId = message.ownerTabId ?? message.tabId;
  let executionTabId: number | undefined;
  try {
    tabId ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
    if (!tabId) throw new Error('No active tab');
    const workflow = await WorkflowStore.getInstance().getWorkflow(message.workflowId);
    if (!workflow) throw new Error('Workflow not found');
    const version = await WorkflowStore.getInstance().getVersion(message.versionId || workflow.activeVersionId);
    if (!version) throw new Error('Workflow version not found');
    if (workflow.status === 'archived') throw new Error('Archived workflows cannot be run');
    const ownerTab = await chrome.tabs.get(tabId);
    const ownerWindowId = message.ownerWindowId ?? ownerTab.windowId ?? getWindowForTab(tabId);
    if (ownerWindowId === undefined) throw new Error('Workflow owner window is unavailable');
    const executionMode = message.executionMode ?? workflow.executionMode ?? 'current_tab';
    const startUrl = resolveWorkflowStartUrl(workflow.startUrl, version.steps);
    let executionPage: any;
    let executionWindowId = ownerWindowId;
    if (executionMode === 'new_tab') {
      if (!startUrl) throw new Error('INVALID_START_URL: Workflow requires an HTTP(S) start URL for new-tab execution');
      const created = await createWorkflowExecutionTab(ownerWindowId, startUrl);
      executionTabId = created.tabId;
      executionWindowId = created.windowId;
      executionPage = created.page;
    } else {
      executionTabId = tabId;
      let tabState = getTabState(tabId);
      if (!tabState?.page) {
        await attachToTab(tabId, ownerWindowId);
        tabState = getTabState(tabId);
      }
      executionPage = tabState?.page;
    }
    if (!executionPage || executionTabId === undefined) throw new Error('TAB_ATTACH_FAILED: Workflow could not connect to its execution tab.');

    sendUIMessage('updateOutput', { type: 'system', content: `▶ Running automation: ${workflow.name}` }, tabId, executionWindowId);
    // This message is initiated by the user pressing Run. Trigger domains are
    // for unattended/automatic runs and must not block an explicit manual run
    // against the current tab.
    let lastStepResult = '';
    const runner = new WorkflowRunner();
    const runContext = { tabId: executionTabId, windowId: executionWindowId, ownerTabId: tabId };
    const pageRef = { current: executionPage };
    workflowRunners.set(`pending:${executionTabId}`, { runner, executionTabId, ownerTabId: tabId });
    workflowRunByExecutionTab.set(executionTabId, runner);
    const runPromise = new WorkflowService().run(workflow.id, version, executionPage, {
      variables: message.variables,
      context: runContext,
      pageRef,
      runner,
      callbacks: {
        onStepEnd: (_step, result) => {
          // Read-only workflow steps (for example, page summaries) return
          // useful output that must be surfaced in the conversation UI.
          if (result.trim()) lastStepResult = result;
        },
      },
    });
    if (runner.currentRunId) workflowRunners.set(runner.currentRunId, { runner, executionTabId, ownerTabId: tabId, context: runContext });
    // The runner creates the durable run ID; register the execution tab as soon as it is available.
    const run = await runPromise;
    if (runner.currentRunId) workflowRunners.set(runner.currentRunId, { runner, executionTabId, ownerTabId: tabId, context: runContext });
    workflowRunners.delete(`pending:${executionTabId}`);
    workflowRunners.delete(run.id);
    if (run.executionTabId !== undefined) workflowRunByExecutionTab.delete(run.executionTabId);
    if (lastStepResult) {
      sendUIMessage('updateOutput', { type: 'llm', content: lastStepResult }, tabId, executionWindowId, { runId: run.id, workflowId: workflow.id, executionTabId: run.executionTabId });
    }
    sendUIMessage('updateOutput', { type: 'system', content: `Automation ${run.status}: ${workflow.name}${run.failureMessage ? `\n${run.failureMessage}` : ''}` }, tabId, executionWindowId, { runId: run.id, workflowId: workflow.id, executionTabId: run.executionTabId });
    sendUIMessage('processingComplete', null, tabId, executionWindowId, { runId: run.id, workflowId: workflow.id, executionTabId: run.executionTabId });
    sendResponse({ success: run.status === 'succeeded', run });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[runWorkflow] failed', {
      workflowId: message.workflowId,
      versionId: message.versionId,
      tabId,
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    if (tabId) {
      sendUIMessage('updateOutput', { type: 'system', content: `Automation failed: ${errorMessage}` }, tabId);
      sendUIMessage('processingComplete', null, tabId);
    }
    sendResponse({ success: false, error: errorMessage });
  }
}

if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((removedTabId) => {
    const runner = workflowRunByExecutionTab.get(removedTabId);
    if (runner) runner.cancel();
  });
}

function resolveWorkflowStartUrl(explicitUrl: string | undefined, steps: Array<{ type: string; input?: unknown }>): string | undefined {
  const candidate = explicitUrl ?? steps.find(step => step.type === 'navigate' && typeof step.input === 'string')?.input as string | undefined;
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Handle the executePrompt message
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
function handleExecutePrompt(
  message: Extract<BackgroundMessage, { action: 'executePrompt' }>,
  sendResponse: (response?: any) => void
): void {
  // Use the tabId from the message if available
  if (message.tabId) {
    // Check if this is a multitab analysis request
    if ((message as any).multiTabAnalysis && (message as any).selectedTabIds) {
      executePrompt(message.prompt, message.tabId, false, message.role, (message as any).selectedTabIds, message.contextMode);
    } else {
      executePrompt(message.prompt, message.tabId, false, message.role, undefined, message.contextMode);
    }
  } else {
    executePrompt(message.prompt);
  }
  sendResponse({ success: true });
}

/**
 * Handle the cancelExecution message
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
function handleCancelExecution(
  message: Extract<BackgroundMessage, { action: 'cancelExecution' }>,
  sendResponse: (response?: any) => void
): void {
  cancelExecution(message.tabId);
  sendResponse({ success: true });
}

/**
 * Handle the clearHistory message
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
async function handleClearHistory(
  message: Extract<BackgroundMessage, { action: 'clearHistory' }>,
  sendResponse: (response?: any) => void
): Promise<void> {
  await clearMessageHistory(message.tabId, message.windowId);
  
  // Reset token tracking
  try {
    const tokenTracker = TokenTrackingService.getInstance();
    tokenTracker.reset(message.windowId);
    
    // Notify UI of reset
    chrome.runtime.sendMessage({
      action: 'tokenUsageUpdated',
      content: tokenTracker.getUsage(),
      tabId: message.tabId,
      windowId: message.windowId
    });
  } catch (error) {
    logWithTimestamp(`Error resetting token tracking: ${String(error)}`, 'warn');
  }
  
  sendResponse({ success: true });
}

/**
 * Handle the initializeTab message
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
function handleInitializeTab(
  message: Extract<BackgroundMessage, { action: 'initializeTab' }>,
  sendResponse: (response?: any) => void
): void {
  // Initialize the tab as soon as the side panel is opened
  if (message.tabId) {
    // Use setTimeout to make this asynchronous and return the response immediately
    setTimeout(async () => {
      try {
        // Get the tab title before attaching
        let tabTitle = "Unknown Tab";
        try {
          const tab = await chrome.tabs.get(message.tabId);
          if (tab && tab.title) {
            tabTitle = tab.title;
          }
        } catch (titleError) {
          handleError(titleError, 'getting tab title');
        }
        
        await attachToTab(message.tabId, message.windowId);
        await initializeAgent(message.tabId);
        
        // Get the tab state to check if attachment was successful
        const tabState = getTabState(message.tabId);
        if (tabState) {
          // Send a message back to the side panel with the tab title
          chrome.runtime.sendMessage({
            action: 'updateOutput',
            content: {
              type: 'system',
              content: `Connected to tab: ${tabState.title || tabTitle}`
            },
            tabId: message.tabId,
            windowId: tabState.windowId
          });
        }
        
        logWithTimestamp(`Tab ${message.tabId} in window ${message.windowId || 'unknown'} initialized from side panel`);
      } catch (error) {
        handleError(error, 'initializing tab from side panel');
      }
    }, 0);
  }
  sendResponse({ success: true });
}

/**
 * Handle the switchToTab message
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
async function handleSwitchToTab(
  message: Extract<BackgroundMessage, { action: 'switchToTab' }>,
  sendResponse: (response?: any) => void
): Promise<void> {
  if (message.tabId) {
    // Get the window ID for this tab if available
    const windowId = getWindowForTab(message.tabId);
    
    // Focus the window first if we have a window ID
    try {
      if (windowId) await chrome.windows.update(windowId, { focused: true });
      await activateTabSafely(message.tabId);
      logWithTimestamp(`Switched to tab ${message.tabId} in window ${windowId || 'unknown'}`);
    } catch (error) {
      logWithTimestamp(`Could not switch to tab ${message.tabId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
      sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }
  }
  sendResponse({ success: true });
}

async function handleRefreshTab(
  message: Extract<BackgroundMessage, { action: 'refreshTab' }>,
  sendResponse: (response?: any) => void
): Promise<void> {
  if (message.tabId) {
    // Get the window ID for this tab if available
    const windowId = getWindowForTab(message.tabId);
    
    // Focus the window first if we have a window ID
    try {
      if (windowId) await chrome.windows.update(windowId, { focused: true });
      await activateTabSafely(message.tabId);
      logWithTimestamp(`Refreshed focus on tab ${message.tabId} in window ${windowId || 'unknown'}`);
    } catch (error) {
      logWithTimestamp(`Could not refresh tab ${message.tabId}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
      sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }
  }
  sendResponse({ success: true });
}

async function activateTabSafely(tabId: number): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/cannot be edited right now|dragging a tab/i.test(message) || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
}

/**
 * Handle the getTokenUsage message
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
function handleGetTokenUsage(
  message: Extract<BackgroundMessage, { action: 'getTokenUsage' }>,
  sendResponse: (response?: any) => void
): void {
  try {
    const tokenTracker = TokenTrackingService.getInstance();
    const usage = tokenTracker.getUsage();
    
    // Get the window ID if available
    const windowId = message.windowId;
    const tabId = message.tabId;
    
    // Send the usage directly in the response
    sendResponse({ 
      success: true, 
      usage 
    });
    
    // Also broadcast it to all clients
    chrome.runtime.sendMessage({
      action: 'tokenUsageUpdated',
      content: usage,
      tabId,
      windowId
    });
  } catch (error) {
    const errorMessage = handleError(error, 'getting token usage');
    logWithTimestamp(`Error getting token usage: ${errorMessage}`, 'error');
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle the reflectAndLearn message
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
function handleReflectAndLearn(
  message: Extract<BackgroundMessage, { action: 'reflectAndLearn' }>,
  sendResponse: (response?: any) => void
): void {
  try {
    console.log("MEMORY DEBUG: handleReflectAndLearn called", { tabId: message.tabId });
    
    // Trigger the reflection process
    triggerReflection(message.tabId);
    
    console.log("MEMORY DEBUG: triggerReflection called successfully");
    sendResponse({ success: true });
  } catch (error) {
    console.error("MEMORY DEBUG: Error in handleReflectAndLearn", error);
    const errorMessage = handleError(error, 'triggering reflection');
    logWithTimestamp(`Error triggering reflection: ${errorMessage}`, 'error');
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle the forceResetPlaywright message
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
async function handleForceResetPlaywright(
  message: Extract<BackgroundMessage, { action: 'forceResetPlaywright' }>,
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    logWithTimestamp('Force resetting Playwright instance');
    
    // Call the forceResetPlaywright function from tabManager
    const result = await forceResetPlaywright();
    
    // Get the current tab and window ID if possible
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tabId = tabs[0]?.id;
    const windowId = tabs[0]?.windowId;
    
    // Notify UI components about the reset
    chrome.runtime.sendMessage({
      action: 'updateOutput',
      content: {
        type: 'system',
        content: `Playwright instance has been force reset. ${result ? 'Success' : 'Failed'}`
      },
      tabId,
      windowId
    });
    
    sendResponse({ success: result });
  } catch (error) {
    const errorMessage = handleError(error, 'force resetting Playwright instance');
    logWithTimestamp(`Error force resetting Playwright instance: ${errorMessage}`, 'error');
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle the checkAgentStatus message
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
async function handleCheckAgentStatus(
  message: Extract<BackgroundMessage, { action: 'checkAgentStatus' }>,
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    // Get the window ID for this tab
    const windowId = message.windowId || (message.tabId ? getWindowForTab(message.tabId) : null);
    
    if (!windowId) {
      logWithTimestamp(`Cannot check agent status: No window ID found for tab ${message.tabId}`, 'warn');
      sendResponse({ success: false, error: 'No window ID found' });
      return;
    }
    
    // Get the agent status from agentController using dynamic import
    const { getAgentStatus } = await import('./agentController');
    const status = getAgentStatus(windowId);
    
    // Send the status back to the UI
    chrome.runtime.sendMessage({
      action: 'agentStatusUpdate',
      status: status.status,
      timestamp: status.timestamp,
      lastHeartbeat: status.lastHeartbeat,
      tabId: message.tabId,
      windowId
    });
    
    sendResponse({ success: true });
  } catch (error) {
    const errorMessage = handleError(error, 'checking agent status');
    logWithTimestamp(`Error checking agent status: ${errorMessage}`, 'error');
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle PDF interception toggle
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
function handleTogglePdfInterception(
  message: Extract<BackgroundMessage, { action: 'togglePdfInterception' }>,
  sendResponse: (response?: any) => void
): void {
  try {
    // Store the setting in Chrome storage
    chrome.storage.sync.set({
      'pdf-interceptor-enabled': message.enabled
    }, () => {
      if (chrome.runtime.lastError) {
        logWithTimestamp(`Error storing PDF interception setting: ${chrome.runtime.lastError.message}`, 'error');
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      // Broadcast to all content scripts
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'togglePdfInterception',
              enabled: message.enabled
            }).catch(() => {
              // Ignore errors - content script might not be injected
            });
          }
        });
      });

      logWithTimestamp(`PDF interception ${message.enabled ? 'enabled' : 'disabled'}`);
      sendResponse({ success: true });
    });
  } catch (error) {
    const errorMessage = handleError(error, 'toggling PDF interception');
    logWithTimestamp(`Error toggling PDF interception: ${errorMessage}`, 'error');
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle PDF URL check
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
function handleCheckPdfUrl(
  message: Extract<BackgroundMessage, { action: 'checkPdfUrl' }>,
  sendResponse: (response?: any) => void
): void {
  try {
    if (!message.tabId) {
      sendResponse({ success: false, error: 'No tab ID provided' });
      return;
    }

    // Send message to content script to check PDF URL
    chrome.tabs.sendMessage(message.tabId, {
      action: 'checkPdfUrl'
    }).then((response) => {
      sendResponse({ success: true, ...response });
    }).catch((error) => {
      logWithTimestamp(`Error checking PDF URL in tab ${message.tabId}: ${error}`, 'error');
      sendResponse({ success: false, error: 'Failed to check PDF URL' });
    });
  } catch (error) {
    const errorMessage = handleError(error, 'checking PDF URL');
    logWithTimestamp(`Error checking PDF URL: ${errorMessage}`, 'error');
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Fetch PDF file as blob through background script to bypass CORS
 */
async function handleFetchPdfAsBlob(
  message: Extract<BackgroundMessage, { action: 'fetchPdfAsBlob' }>,
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    const response = await fetch(message.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(
      Array.from(new Uint8Array(arrayBuffer))
        .map(byte => String.fromCharCode(byte))
        .join('')
    );

    sendResponse({
      success: true,
      data: base64,
      type: blob.type
    });
  } catch (error) {
    const errorMessage = handleError(error, 'fetching PDF as blob');
    logWithTimestamp(`Error fetching PDF as blob: ${errorMessage}`, 'error');
    sendResponse({ success: false, error: errorMessage });
  }
}

/**
 * Handle PDF AI chat requests
 * @param message The message to handle
 * @param sendResponse The function to send a response
 */
async function handlePdfAiChat(
  message: any,
  sendResponse: (response?: any) => void
): Promise<void> {
  console.log('[PDF AI Chat] Received request:', {
    hasMessage: !!message.message,
    messageLength: message.message?.length,
    hasSystemPrompt: !!message.systemPrompt,
    systemPromptLength: message.systemPrompt?.length,
    hasChatHistory: !!message.chatHistory,
    historyLength: message.chatHistory?.length
  });

  try {
    const { message: userMessage, systemPrompt, chatHistory } = message;

    if (!userMessage) {
      console.log('[PDF AI Chat] Error: No message provided');
      sendResponse({ success: false, error: 'No message provided' });
      return;
    }

    console.log('[PDF AI Chat] User message:', userMessage.substring(0, 100) + '...');

    // Get provider configuration
    const configManager = ConfigManager.getInstance();
    const providerConfig = await configManager.getProviderConfig();

    console.log('[PDF AI Chat] Provider config:', {
      provider: providerConfig.provider,
      hasApiKey: !!providerConfig.apiKey,
      modelId: providerConfig.apiModelId,
      hasBaseUrl: !!providerConfig.baseUrl
    });

    if (!providerConfig.apiKey && providerConfig.provider !== 'ollama') {
      console.log('[PDF AI Chat] Error: No API key configured for provider:', providerConfig.provider);
      sendResponse({
        success: false,
        error: 'No LLM provider configured. Please configure an API key in the settings.'
      });
      return;
    }

    // Create the LLM provider
    console.log('[PDF AI Chat] Creating LLM provider...');
   
    const llmProvider = await createProvider(providerConfig.provider, {
      apiKey: providerConfig.apiKey || '',
      apiModelId: providerConfig.apiModelId,
      baseUrl: providerConfig.baseUrl,
      thinkingBudgetTokens: providerConfig.thinkingBudgetTokens,
      openaiCompatibleModels: providerConfig.openaiCompatibleModels,
    });
    console.log('[PDF AI Chat] LLM provider created successfully');

    // Dynamically import SimpleChatAgent to avoid circular dependencies
    console.log('[PDF AI Chat] Creating SimpleChatAgent...');

    // Create a new SimpleChatAgent instance
    const chatAgent = new SimpleChatAgent(llmProvider, systemPrompt || '');
    console.log('[PDF AI Chat] SimpleChatAgent created with system prompt length:', (systemPrompt || '').length);

    // Load chat history if provided
    if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
      console.log('[PDF AI Chat] Loading chat history with', chatHistory.length, 'messages');
      chatAgent.setHistory(chatHistory);
    }

    // Use chatSync to get the response
    console.log('[PDF AI Chat] Sending message to LLM...');
    const startTime = Date.now();
    const response = await chatAgent.chatSync(userMessage, false); // false = don't add to history since we manage it in the frontend
    const duration = Date.now() - startTime;

    console.log('[PDF AI Chat] Received response from LLM:', {
      responseLength: response.length,
      duration: `${duration}ms`,
      preview: response.substring(0, 100) + '...'
    });

    sendResponse({
      success: true,
      response: response
    });

    console.log('[PDF AI Chat] Request completed successfully');
  } catch (error) {
    console.error('[PDF AI Chat] Error occurred:', error);
    console.error('[PDF AI Chat] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    const errorMessage = handleError(error, 'processing PDF AI chat');
    logWithTimestamp(`Error processing PDF AI chat: ${errorMessage}`, 'error');

    console.log('[PDF AI Chat] Sending error response:', errorMessage);
    sendResponse({ success: false, error: errorMessage });
  }
}


/**
 * Set up message listeners
 */
export function setupMessageListeners(): void {
  chrome.runtime.onMessage.addListener(handleMessage);
}
