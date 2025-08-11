import type { Page } from "playwright-crx";
import { ConfigManager, ProviderConfig } from "../background/configManager";
import { createProvider } from "../models/providers/factory";
import { LLMProvider } from "../models/providers/types";
import { ErrorHandler } from "./ErrorHandler";
import { ExecutionEngine, ExecutionCallbacks } from "./ExecutionEngine";
import { MemoryManager } from "./MemoryManager";
import { initializePageContext } from "./PageContextManager";
import { PromptManager } from "./PromptManager";
import { ToolManager } from "./ToolManager";
import { getAllTools } from "./tools/index";
import { BrowserTool } from "./tools/types";

/**
 * SubAgent is a specialized agent for handling sub-tasks within the browser.
 * It shares similar architecture with BrowserAgent but with focused capabilities.
 */
export class SubAgent {
  private llmProvider: LLMProvider;
  private toolManager: ToolManager;
  promptManager: PromptManager;
  private memoryManager: MemoryManager;
  private errorHandler: ErrorHandler;
  private executionEngine: ExecutionEngine;

  /**
   * Create a new SubAgent
   */
  constructor(page: Page, config: ProviderConfig, provider?: LLMProvider) {
    // Initialize the PageContextManager with the initial page
    initializePageContext(page);

    // Use the provided provider or create a new one
    this.llmProvider = provider!;

    // Get all tools from the tools module and convert them to BrowserTool objects
    const rawTools = getAllTools(page);
    const browserTools = this.convertToBrowserTools(rawTools);

    // Initialize all the components
    this.toolManager = new ToolManager(page, browserTools);
    this.promptManager = new PromptManager(this.toolManager.getTools());
    this.memoryManager = new MemoryManager(this.toolManager.getTools());
    this.errorHandler = new ErrorHandler();

    // Initialize the execution engine with all the components
    this.executionEngine = new ExecutionEngine(
      this.llmProvider,
      this.toolManager,
      this.promptManager,
      this.memoryManager,
      this.errorHandler
    );
  }

  /**
   * Convert tools to BrowserTool format
   */
  private convertToBrowserTools(tools: any[]): BrowserTool[] {
    return tools.map(tool => {
      if (typeof tool === 'object' && 'name' in tool && 'description' in tool && 'func' in tool) {
        return tool as BrowserTool;
      } else {
        console.warn(`Unknown tool format for tool: ${JSON.stringify(tool)}`);
        return {
          name: tool.name || 'unknown_tool',
          description: tool.description || 'Unknown tool',
          func: async (input: string) => {
            try {
              if (typeof tool.func === 'function') {
                return await tool.func(input);
              }
              return `Error: Tool function not available`;
            } catch (error) {
              return `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
        };
      }
    });
  }

  /**
   * Execute a focused sub-task
   */
  async executeSubTask(
    task: string,
    callbacks: ExecutionCallbacks,
    context: any = {}
  ): Promise<void> {
    return this.executionEngine.executePrompt(
      task,
      callbacks,
      [], // No initial messages
      false, // Non-streaming mode
      'sub-agent' // Special role for sub-agent
    );
  }

  /**
   * Cancel the current execution
   */
  cancel(): void {
    this.errorHandler.cancel();
  }

  /**
   * Reset the cancel flag
   */
  resetCancel(): void {
    this.errorHandler.resetCancel();
  }
}

/**
 * Create a new SubAgent
 */
export async function createSubAgent(
  page: Page,
  apiKey: string
): Promise<SubAgent> {
  // Get provider configuration
  const configManager = ConfigManager.getInstance();
  let providerConfig: ProviderConfig;

  try {
    providerConfig = await configManager.getProviderConfig();
  } catch (error) {
    console.warn('Failed to get provider configuration, using default:', error);
    providerConfig = {
      provider: 'anthropic',
      apiKey,
      apiModelId: 'claude-3-7-sonnet-20250219',
    };
  }

  // Use the provided API key as a fallback if the stored one is empty
  if (!providerConfig.apiKey) {
    providerConfig.apiKey = apiKey;
  }

  // Create the provider with the configuration
  const provider = await createProvider(providerConfig.provider, {
    apiKey: providerConfig.apiKey,
    apiModelId: providerConfig.apiModelId,
    baseUrl: providerConfig.baseUrl,
    thinkingBudgetTokens: providerConfig.thinkingBudgetTokens,
    dangerouslyAllowBrowser: true,
  });

  // Create the sub-agent with the provider configuration and provider
  return new SubAgent(page, providerConfig, provider);
}