import { ExecutionCallbacks } from '../agent/ExecutionEngine';
import { normalizeDomain } from '../tracking/domainUtils';
import { MemoryService, AgentMemory } from '../tracking/memoryService';
import { executePrompt } from './agentController';
import { getTabState, getWindowForTab, getAgentForWindow } from './tabManager';
import { logWithTimestamp, handleError, sendUIMessage } from './utils';
import type { ToolTraceEvent } from '../workflows/types';

type ReflectionSource = { domain: string; task: string; runId: string; toolSequence: string[] };
const reflectionSources = new Map<number, ReflectionSource>();

export function clearReflectionSource(tabId: number): void {
  reflectionSources.delete(tabId);
}

export function recordReflectionSource(tabId: number, domain: string, task: string, trace: ToolTraceEvent[]): void {
  const actionNames = new Set(['browser_click', 'browser_type', 'browser_keyboard_type', 'browser_press_key']);
  const toolSequence = trace
    .filter(event => event.result?.ok === true && actionNames.has(event.toolName))
    .map(event => {
      const input = String(event.input ?? '');
      const safeInput = event.toolName === 'browser_type'
        ? `${input.split('|')[0]}|[text]`
        : event.toolName === 'browser_keyboard_type' ? '[text]' : input;
      return `${event.toolName} | ${safeInput}`;
    });
  if (toolSequence.length === 0) {
    clearReflectionSource(tabId);
    return;
  }
  reflectionSources.set(tabId, {
    domain: normalizeDomain(domain), task, toolSequence,
    runId: trace[0]?.executionId ?? `${Date.now()}-${tabId}`,
  });
}

// Function to directly save a memory from the reflection process
export async function saveReflectionMemory(content: string, domain: string, tabId: number): Promise<void> {
  try {
    // Normalize the domain to ensure consistency
    const normalizedDomain = normalizeDomain(domain);
    
    await processReflectionOutput(content, normalizedDomain, tabId);
    // No UI message here - processReflectionOutput will handle notifications
  } catch (error) {
    // Send an error notification to the UI
    sendUIMessage('updateOutput', {
      type: 'system',
      content: `❌ Error saving memory: ${error instanceof Error ? error.message : String(error)}`
    }, tabId);
  }
}

/**
 * Trigger the reflection process for a specific tab
 * @param tabId The ID of the tab to reflect on, or undefined to use the active tab
 */
export async function triggerReflection(tabId?: number): Promise<void> {
  try {
    // Get the active tab ID if not provided
    let activeTabId = tabId;
    if (!activeTabId) {
      try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        activeTabId = tabs[0]?.id;
        if (!activeTabId) {
          throw new Error('No active tab found');
        }
      } catch (error) {
        logWithTimestamp(`Error getting active tab: ${error instanceof Error ? error.message : String(error)}`, 'error');
        throw error;
      }
    }
    const tabState = getTabState(activeTabId);
    const source = reflectionSources.get(activeTabId);
    if (!source) {
      sendUIMessage('updateOutput', { type: 'system', content: 'No completed browser task is available to reflect on.' }, activeTabId);
      return;
    }
    
    // Get the window ID for this tab
    const windowId = getWindowForTab(activeTabId);
    if (!windowId) {
      logWithTimestamp(`Cannot reflect: No window ID for tab ${activeTabId}`, 'warn');
      
      // Notify the UI
      sendUIMessage('updateOutput', {
        type: 'system',
        content: `❌ Cannot reflect: No window ID found for this tab.`
      }, activeTabId, windowId);
      
      return;
    }
    
    // Get the agent for this window
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      logWithTimestamp(`Cannot reflect: No agent for window ${windowId}`, 'warn');
      
      // Notify the UI
      sendUIMessage('updateOutput', {
        type: 'system',
        content: `❌ Cannot reflect: No active agent session found.`
      }, activeTabId, windowId);
      
      return;
    }
    
    // Get the current URL to extract the domain
    let domain = "unknown";
    try {
      const tab = await chrome.tabs.get(activeTabId);
      if (tab.url) {
        const url = new URL(tab.url);
        // Normalize the domain to ensure consistency
        domain = normalizeDomain(url.hostname);
      }
    } catch (error) {
      handleError(error, 'getting tab URL for reflection');
    }
    
    // Notify the UI that reflection has started
    sendUIMessage('updateOutput', {
      type: 'system',
      content: `🧠 Reflecting on this session to learn useful patterns for ${domain}...`
    }, activeTabId, windowId);
    
    // Create a reflection prompt
    if (source.domain !== domain) {
      sendUIMessage('updateOutput', { type: 'system', content: 'The current website differs from the completed task. Return to that website before reflecting.' }, activeTabId);
      return;
    }
    const reflectionPrompt = `Summarize only this completed browser task as one reusable task description.\nOriginal request: ${source.task}\nVerified tool steps: ${JSON.stringify(source.toolSequence)}\nReturn only JSON: {"taskDescription":"brief task description"}. Do not invent steps or use earlier conversation history.`;
    
    // Execute the reflection prompt with callbacks, marking it as a reflection prompt
    executePrompt(reflectionPrompt, activeTabId, true);
  } catch (error) {
    logWithTimestamp(`Error during reflection: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

/**
 * Process the reflection output to extract and save memories
 * @param output The LLM output to process
 * @param domain The domain to associate with the memories
 * @param tabId The tab ID for sending UI messages
 * @param isCorrection Whether this is a correction attempt
 */
async function processReflectionOutput(output: string, domain: string, tabId: number, isCorrection: boolean = false): Promise<void> {
  try {
    const source = reflectionSources.get(tabId);
    if (!source || source.domain !== domain) throw new Error('No matching completed task trace is available');
    // Check if IndexedDB is available
    if (typeof indexedDB === 'undefined') {
      logWithTimestamp(`IndexedDB is not available in this browser environment`, 'error');
      sendUIMessage('updateOutput', {
        type: 'system',
        content: `❌ Cannot save memories: IndexedDB is not available in this browser environment.`
      }, tabId);
      return;
    }
    
    // Look for JSON in the output
    const jsonMatch = output.match(/```json\n([\s\S]*?)\n```/) || 
                      output.match(/```\n([\s\S]*?)\n```/) ||
                      output.match(/{[\s\S]*?}/);
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const cleanJsonStr = jsonStr.trim();
      
      // Try to parse the JSON
      let memories: Array<{ taskDescription?: unknown }> = [];
      try {
        const parsed = JSON.parse(cleanJsonStr);
        
        // Check if it's a single memory or an array of memories
        if (Array.isArray(parsed)) {
          memories = parsed;
        } else {
          memories = [parsed];
        }
      } catch (parseError) {
        // If parsing fails, try to extract JSON objects from the string
        const jsonObjects = extractJsonObjects(cleanJsonStr);
        if (jsonObjects.length > 0) {
          memories = jsonObjects;
        } else {
          // If this is already a correction attempt, don't try again to avoid infinite loops
          if (isCorrection) {
            throw parseError;
          }
          
          // Otherwise, attempt correction
          logWithTimestamp(`JSON parsing error, attempting correction: ${parseError instanceof Error ? parseError.message : String(parseError)}`, 'warn');
          
          // Notify the UI that we're attempting correction
          sendUIMessage('updateOutput', {
            type: 'system',
            content: `⚠️ Memory format error detected. Asking agent to correct it...`
          }, tabId);
          
          // Attempt correction
          await correctReflectionJSON(cleanJsonStr, parseError as Error, domain, tabId);
          return;
        }
      }
      
      // Initialize the memory service
      const memoryService = MemoryService.getInstance();
      await memoryService.init();
      
      // Save one candidate. Steps and domain come from the verified execution trace.
      const savedIds: number[] = [];
      for (const candidate of memories.slice(0, 1)) {
        if (typeof candidate?.taskDescription !== 'string' || !candidate.taskDescription.trim()) continue;
        const memory: AgentMemory = {
          domain: source.domain,
          taskDescription: candidate.taskDescription.trim().slice(0, 160),
          toolSequence: source.toolSequence,
          createdAt: Date.now(),
          source: 'reflection',
          sourceRunId: source.runId,
          status: 'needs_review',
        };
        try {
          const id = await memoryService.storeMemory(memory);
          savedIds.push(id);
        } catch (storeError) {
          logWithTimestamp(`Error storing memory: ${storeError instanceof Error ? storeError.message : String(storeError)}`, 'error');
        }
      }
      
      // Notify the UI
      if (savedIds.length > 0) {
        sendUIMessage('updateOutput', {
          type: 'system',
          content: `Saved ${savedIds.length} memory candidate for ${domain}. Review it in Settings → Memory before the agent uses it.`
        }, tabId);
      } else {
        sendUIMessage('updateOutput', {
          type: 'system',
          content: `⚠️ No valid memories were found in the reflection. Please try again.`
        }, tabId);
      }
    } else {
      // No JSON found
      sendUIMessage('updateOutput', {
        type: 'system',
        content: `❌ Could not extract a valid memory from the reflection. Please try again.`
      }, tabId);
    }
  } catch (error) {
    // JSON parsing error
    logWithTimestamp(`Error processing reflection: ${error instanceof Error ? error.message : String(error)}`, 'error');
    sendUIMessage('updateOutput', {
      type: 'system',
      content: `❌ Error processing reflection: ${error instanceof Error ? error.message : String(error)}`
    }, tabId);
  }
}

/**
 * Function to handle JSON correction by prompting the agent to fix the malformed JSON
 * @param malformedJson The malformed JSON string that needs correction
 * @param error The error that occurred during parsing
 * @param domain The domain to associate with the memories
 * @param tabId The tab ID for sending UI messages
 */
async function correctReflectionJSON(malformedJson: string, error: Error, domain: string, tabId: number): Promise<void> {
  try {
    // Extract the relevant part of the error message
    const errorMessage = error.message;
    
    // Create a correction prompt
    const correctionPrompt = `
      I attempted to save a memory, but there was a JSON parsing error:
      
      ERROR: ${errorMessage}
      
      Here is the malformed JSON that needs to be fixed:
      \`\`\`
      ${malformedJson}
      \`\`\`
      
      Please correct the JSON and provide only: {"taskDescription":"brief task description"}
    `;
    
    // Notify the UI about the correction attempt
    sendUIMessage('updateOutput', {
      type: 'system',
      content: `🔄 Attempting to correct JSON format error: ${errorMessage}`
    }, tabId);
    
    // Create a custom callback for handling the corrected JSON
    const correctionCallbacks: ExecutionCallbacks = {
      onLlmOutput: async (output: string) => {
        // Try to process the corrected output
        try {
          await processReflectionOutput(output, domain, tabId, true);
        } catch (correctionError) {
          // If correction still fails, give up
          logWithTimestamp(`Correction attempt failed: ${correctionError instanceof Error ? correctionError.message : String(correctionError)}`, 'error');
          
          sendUIMessage('updateOutput', {
            type: 'system',
            content: `❌ Error processing reflection: Even after correction attempt, JSON is still invalid. ${correctionError instanceof Error ? correctionError.message : String(correctionError)}`
          }, tabId);
        }
      },
      onToolOutput: (content) => {
        // Pass through tool outputs
        sendUIMessage('updateOutput', {
          type: 'system',
          content: content
        }, tabId);
      },
      onComplete: () => {
        // Nothing special needed on completion
      }
    };
    
    // Get the window ID for this tab
    const windowId = getWindowForTab(tabId);
    if (!windowId) {
      throw new Error(`No window ID found for tab ${tabId}`);
    }
    
    // Get the agent for this window
    const agent = getAgentForWindow(windowId);
    if (!agent) {
      throw new Error(`No agent found for window ${windowId}`);
    }
    
    // Execute the correction prompt
    // We're using a direct call to the agent's executePrompt method
    // This is a special case for correction, not a regular user prompt
    const { executePromptWithFallback } = await import('../agent/AgentCore');
    await executePromptWithFallback(agent, correctionPrompt, correctionCallbacks, []);
    
  } catch (correctionError) {
    logWithTimestamp(`Error during JSON correction: ${correctionError instanceof Error ? correctionError.message : String(correctionError)}`, 'error');
    
    // Notify the UI about the failed correction attempt
    sendUIMessage('updateOutput', {
      type: 'system',
      content: `❌ Failed to correct memory JSON: ${correctionError instanceof Error ? correctionError.message : String(correctionError)}`
    }, tabId);
  }
}

/**
 * Helper function to extract JSON objects from a string
 * @param str The string to extract JSON objects from
 * @returns An array of parsed JSON objects
 */
function extractJsonObjects(str: string): any[] {
  const objects: any[] = [];
  let depth = 0;
  let start = -1;
  
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      if (depth === 0) {
        start = i;
      }
      depth++;
    } else if (str[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const jsonStr = str.substring(start, i + 1);
          const obj = JSON.parse(jsonStr);
          objects.push(obj);
        } catch (e) {
          // Ignore invalid JSON
        }
        start = -1;
      }
    }
  }
  
  return objects;
}
