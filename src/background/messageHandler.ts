import { handleApprovalResponse } from '../agent/approvalManager';
import { createProvider }  from '../models/providers/factory';
import { TokenTrackingService } from '../tracking/tokenTrackingService';
import { executePrompt } from './agentController';
import { cancelExecution } from './agentController';
import { clearMessageHistory } from './agentController';
import { initializeAgent } from './agentController';
import { ConfigManager } from './configManager';
import { triggerReflection } from './reflectionController';
import { attachToTab, getTabState, getWindowForTab, forceResetPlaywright } from './tabManager';
import { BackgroundMessage, DownloadMarkdownMessage } from './types';
import { logWithTimestamp, handleError } from './utils';
import { SimpleChatAgent } from '../agent/SimpleChatAgent';
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

      case 'cancelExecution':
        handleCancelExecution(message, sendResponse);
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
        handleSwitchToTab(message, sendResponse);
        return true;

      case 'refreshTab':
        handleRefreshTab(message, sendResponse);
        return true;
        
      case 'getTokenUsage':
        handleGetTokenUsage(message, sendResponse);
        return true;
        
      case 'approvalResponse':
        handleApprovalResponse(message.requestId, message.approved);
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
          return true;

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
      message.action === 'cancelExecution' ||
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
    )
  );
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
      executePrompt(message.prompt, message.tabId, false, message.role, (message as any).selectedTabIds);
    } else {
      executePrompt(message.prompt, message.tabId, false, message.role);
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
function handleSwitchToTab(
  message: Extract<BackgroundMessage, { action: 'switchToTab' }>,
  sendResponse: (response?: any) => void
): void {
  if (message.tabId) {
    // Get the window ID for this tab if available
    const windowId = getWindowForTab(message.tabId);
    
    // Focus the window first if we have a window ID
    if (windowId) {
      chrome.windows.update(windowId, { focused: true });
    }
    
    // Then focus the tab
    chrome.tabs.update(message.tabId, { active: true });
    
    logWithTimestamp(`Switched to tab ${message.tabId} in window ${windowId || 'unknown'}`);
  }
  sendResponse({ success: true });
}

function handleRefreshTab(
  message: Extract<BackgroundMessage, { action: 'refreshTab' }>,
  sendResponse: (response?: any) => void
): void {
  if (message.tabId) {
    // Get the window ID for this tab if available
    const windowId = getWindowForTab(message.tabId);
    
    // Focus the window first if we have a window ID
    if (windowId) {
      chrome.windows.update(windowId, { focused: true });
    }
    
    // Then focus the tab
    chrome.tabs.update(message.tabId, { active: true });
    
    logWithTimestamp(`Switched to tab ${message.tabId} in window ${windowId || 'unknown'}`);
  }
  sendResponse({ success: true });
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
