import { setupWorkflowScheduling } from '../workflows/schedulingIntegration';
import { MemoryService } from '../tracking/memoryService';
import { setupMessageListeners } from './messageHandler';
import { putPendingAction } from '../actions';
import { cleanupOnUnload, setupTabListeners } from './tabManager';
import { logWithTimestamp } from './utils';
import { setupMonitoring } from '../monitoring/backgroundIntegration';
import { TaskModelRoutingService } from '../models/routing/TaskModelRoutingService';

/**
 * Initialize the extension
 */
function initializeExtension(): void {
  logWithTimestamp('BrowserOnly 🤖️ extension initialized');
  
  // Set up message listeners
  setupMessageListeners();

  // Set up tab listeners
  setupTabListeners();

  // Set up event listeners
  setupEventListeners();

  // Set up command listeners
  setupCommandListeners();

  setupMonitoring();
  setupWorkflowScheduling();
}

/**
 * Set up event listeners for the extension
 */
function setupEventListeners(): void {
  // Listen for changes to Chrome storage
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
      // Check if any provider configuration has changed
      const providerConfigChanged = Object.keys(changes).some(key =>
        key === 'provider' ||
        key === 'anthropicApiKey' ||
        key === 'openaiApiKey' ||
        key === 'geminiApiKey' ||
        key === 'ollamaApiKey' ||
        key === 'deepseekApiKey' ||
        key === 'openaiCompatibleApiKey' ||
        key === 'anthropicBaseUrl' ||
        key === 'openaiBaseUrl' ||
        key === 'geminiBaseUrl' ||
        key === 'ollamaBaseUrl' ||
        key === 'deepseekBaseUrl' ||
        key === 'openaiCompatibleBaseUrl' ||
        key === 'anthropicModelId' ||
        key === 'openaiModelId' ||
        key === 'geminiModelId' ||
        key === 'ollamaModelId' ||
        key === 'deepseekModelId' ||
        key === 'openaiCompatibleModelId' ||
        key === 'openaiCompatibleModels' ||
        key === 'ollamaCustomModels'
        || key === 'translationProvider'
      );

      if (providerConfigChanged) {
        void TaskModelRoutingService.getAssignments(true).catch(error => {
          logWithTimestamp(`Could not refresh task model assignments: ${String(error)}`, 'warn');
        });
        // Notify all clients that provider configuration has changed
        chrome.runtime.sendMessage({
          action: 'providerConfigChanged'
        });

        logWithTimestamp('Provider configuration changed, notified clients');
      }
    }
  });

  // Open options page when the extension is first installed
  chrome.runtime.onInstalled.addListener((details) => {
    logWithTimestamp('BrowserOnly 🤖️ extension installed');
    
    if (details.reason === 'install') {
      chrome.runtime.openOptionsPage();
    }

    // Initialize the memory database on install or update
    if (details.reason === 'install' || details.reason === 'update') {
      logWithTimestamp('Initializing memory database');
      const memoryService = MemoryService.getInstance();
      memoryService.init().then(async () => {
        logWithTimestamp('Memory database initialized successfully');

        // Import default memories only on fresh install
        if (details.reason === 'install') {
          try {
            logWithTimestamp('Importing default memories for new installation');
            const importedCount = await memoryService.importDefaultMemories();
            if (importedCount > 0) {
              logWithTimestamp(`Successfully imported ${importedCount} default memories`);
            } else {
              logWithTimestamp('No default memories were imported');
            }
          } catch (error) {
            logWithTimestamp(`Error importing default memories: ${error}`, 'error');
          }
        }
      }).catch(error => {
        logWithTimestamp(`Error initializing memory database: ${error}`, 'error');
      });
    }
  });

  // Open the side panel when the extension icon is clicked or Alt+Shift+B is pressed
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      logWithTimestamp(`Opening side panel for tab ${tab.id}`);

      try {
        await chrome.sidePanel.open({ tabId: tab.id });
        logWithTimestamp(`Side panel opened for tab ${tab.id}`);
      } catch (error) {
        logWithTimestamp(`Error opening side panel: ${String(error)}`, 'error');
      }
    } else {
      logWithTimestamp('No tab ID available for action click', 'error');
    }
  });

  // Clean up when the extension is unloaded
  chrome.runtime.onSuspend.addListener(async () => {
    logWithTimestamp('Extension is being suspended, cleaning up resources');
    try {
      await cleanupOnUnload();
      logWithTimestamp('Cleanup completed successfully');

    } catch (error) {
      logWithTimestamp(`Error during cleanup: ${String(error)}`, 'error');
    }
  });

  // Additional cleanup on update or uninstall
  chrome.runtime.onUpdateAvailable.addListener(async (details) => {
    logWithTimestamp(`Extension update available: ${details.version}, cleaning up resources`);
    try {
      await cleanupOnUnload();
      logWithTimestamp('Cleanup before update completed successfully');

    } catch (error) {
      logWithTimestamp(`Error during pre-update cleanup: ${String(error)}`, 'error');
    }
  });

  chrome.runtime.onInstalled.addListener(async () => {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({ id: 'browserOnlyRoot', title: 'BrowserOnly', contexts: ['page', 'selection', 'image'] });
    chrome.contextMenus.create({
      id: "copyToPrompt",
      title: "Send selection to BrowserOnly",
      contexts: ["selection"],
      parentId: 'browserOnlyRoot'
    });
    chrome.contextMenus.create({ id: 'summarizeSelection', title: 'Summarize selection', contexts: ['selection'], parentId: 'browserOnlyRoot' });
    chrome.contextMenus.create({ id: 'explainSelection', title: 'Explain selection', contexts: ['selection'], parentId: 'browserOnlyRoot' });
    chrome.contextMenus.create({ id: 'extractSelection', title: 'Extract from selection', contexts: ['selection'], parentId: 'browserOnlyRoot' });
    chrome.contextMenus.create({ id: 'summarizePage', title: 'Summarize this page', contexts: ['page'], parentId: 'browserOnlyRoot' });
    chrome.contextMenus.create({ id: 'extractPage', title: 'Extract structured data', contexts: ['page'], parentId: 'browserOnlyRoot' });
    chrome.contextMenus.create({ id: 'translateSelection', title: 'Translate selection', contexts: ['selection'], parentId: 'browserOnlyRoot' });
    chrome.contextMenus.create({ id: 'translatePage', title: 'Translate this page', contexts: ['page'], parentId: 'browserOnlyRoot' });
    chrome.contextMenus.create({ id: 'ocrImage', title: 'Recognize text in image', contexts: ['image'], parentId: 'browserOnlyRoot' });
    chrome.contextMenus.create({ id: 'understandImage', title: 'Understand this image', contexts: ['image'], parentId: 'browserOnlyRoot' });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    console.log("copyToPrompt",info)
    if (info.menuItemId === "copyToPrompt") {
      // 将选中的文本存入 storage
      // await chrome.storage.local.set({ copiedText: info.selectionText });
      chrome.runtime.sendMessage({
        type: "copyToPrompt",
        text: info.selectionText
      });
      // 打开 sidepanel
      if(tab?.id){
        void chrome.sidePanel.open({ tabId: tab.id }).catch(error => logWithTimestamp(`Error opening side panel: ${String(error)}`, 'error'));
      }
    }
    const actionMap: Record<string, string> = { summarizeSelection: 'summarize', explainSelection: 'explain', extractSelection: 'extract', summarizePage: 'summarize', extractPage: 'extract', translateSelection: 'translate', translatePage: 'translate' };
    if ((info.menuItemId === 'ocrImage' || info.menuItemId === 'understandImage') && tab?.id !== undefined && info.srcUrl) {
      const actionId = info.menuItemId === 'ocrImage' ? 'ocr-image' : 'understand-image';
      const pending = putPendingAction({ actionId, source: 'context_menu', tabId: tab.id, windowId: tab.windowId, pageUrl: tab.url, pageTitle: tab.title, imageUrl: info.srcUrl, createdAt: Date.now() });
      void chrome.sidePanel.open({ tabId: tab.id }).catch(error => logWithTimestamp(`Error opening side panel: ${String(error)}`, 'error'));
      void pending.catch(error => logWithTimestamp(`Error saving OCR action: ${String(error)}`, 'error'));
      return;
    }
    const actionId = actionMap[String(info.menuItemId)];
    if (actionId && tab?.id !== undefined) {
      const pending = putPendingAction({ actionId, source: 'context_menu', tabId: tab.id, windowId: tab.windowId, pageUrl: tab.url, pageTitle: tab.title, selectionText: info.selectionText, createdAt: Date.now() });
      void chrome.sidePanel.open({ tabId: tab.id }).catch(error => logWithTimestamp(`Error opening side panel: ${String(error)}`, 'error'));
      void pending.catch(error => logWithTimestamp(`Error saving context menu action: ${String(error)}`, 'error'));
    }
  });



  // Try to listen for side panel events if available
  try {
    // @ts-expect-error - These events might not be in the type definitions yet
    if (chrome.sidePanel.onShown) {
      // @ts-expect-error - These events might not be in the type definitions yet
      chrome.sidePanel.onShown.addListener(async (info: { tabId?: number }) => {
        logWithTimestamp(`Side panel shown for tab ${info.tabId}`);

        if (info.tabId) {
          // Get the window ID for this tab
          try {
            const tab = await chrome.tabs.get(info.tabId);
            const windowId = tab.windowId;
            logWithTimestamp(`Side panel shown for tab ${info.tabId} in window ${windowId}`);

            // Send a message to initialize the tab
            chrome.runtime.sendMessage({
              action: 'initializeTab',
              tabId: info.tabId,
              windowId: windowId
            });
          } catch (error) {
            logWithTimestamp(`Error getting window ID for tab ${info.tabId}: ${String(error)}`, 'error');

            // Fall back to initializing without window ID
            chrome.runtime.sendMessage({
              action: 'initializeTab',
              tabId: info.tabId
            });
          }
        }
      });
    }

    // @ts-expect-error - These events might not be in the type definitions yet
    if (chrome.sidePanel.onHidden) {
      // @ts-expect-error - These events might not be in the type definitions yet
      chrome.sidePanel.onHidden.addListener((info: { tabId?: number }) => {
        logWithTimestamp(`Side panel hidden for tab ${info.tabId}`);
        // We don't need to clean up here, but we could if needed
      });
    }
  } catch (error) {
    logWithTimestamp("Side panel events not available: " + String(error), 'warn');
    logWithTimestamp("Using fallback approach for initialization");
  }
}

/**
 * Set up command listeners for keyboard shortcuts
 */
function setupCommandListeners(): void {
  logWithTimestamp('Setting up command listeners for keyboard shortcuts');

  // Log all registered commands to verify our command is registered
  chrome.commands.getAll().then(commands => {
    logWithTimestamp(`Registered commands: ${JSON.stringify(commands)}`);
  }).catch(error => {
    logWithTimestamp(`Error getting registered commands: ${String(error)}`, 'error');
  });

  // Listen for any commands (for future extensibility)
  chrome.commands.onCommand.addListener(async (command) => {
    logWithTimestamp(`Command received: ${command}`);

    // The _execute_action command is handled automatically by Chrome
    // and will trigger the action.onClicked handler

    // This listener is kept for future custom commands and debugging
  });

  logWithTimestamp('Command listeners set up');
}

// Initialize the extension
initializeExtension();

// Export for use in other modules
export default {
  initializeExtension,
  setupEventListeners,
  setupCommandListeners
};
