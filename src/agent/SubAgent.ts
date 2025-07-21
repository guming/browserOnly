import { LLMProvider } from "../models/providers/types";

/**
 * Callback interface for SubAgent execution
 */
/**
 * Callback interface for SubAgent execution
 */
export interface SubAgentCallbacks {
  // onLlmChunk: (s: string) => void;  // Stream chunks
  // onLlmOutput: (s: string) => void;  // Final output (required)
  onComplete: () => void;            // Execution complete (required)
  onError?: (error: any) => void;    // Error handling
}

/**
 * Adapter for handling SubAgent callbacks in both streaming and non-streaming modes
 */
class SubAgentCallbackAdapter {
  private originalCallbacks: SubAgentCallbacks;
  private isStreaming: boolean;
  private buffer: string = '';
  
  constructor(callbacks: SubAgentCallbacks, isStreaming: boolean) {
    this.originalCallbacks = callbacks;
    this.isStreaming = isStreaming;
  }
  
  // get adaptedCallbacks(): SubAgentCallbacks {
  //   return {
  //     // onLlmChunk: this.handleLlmChunk.bind(this),
  //     // onLlmOutput: this.originalCallbacks.onLlmOutput,
  //     // onComplete: this.handleComplete.bind(this),
  //     // onError: this.originalCallbacks.onError
  //   };
  // }
  
  // private handleLlmChunk(chunk: string): void {
  //   if (this.isStreaming && this.originalCallbacks.onLlmChunk) {
  //     this.originalCallbacks.onLlmChunk(chunk);
  //   } else {
  //     this.buffer += chunk;
  //   }
  // }
  
  // private handleComplete(): void {
  //   if (!this.isStreaming && this.buffer.length > 0) {
  //     this.originalCallbacks.onLlmOutput(this.buffer);
  //     this.buffer = '';
  //   }
  //   this.originalCallbacks.onComplete();
  // }
}
import { createProvider } from "../models/providers/factory";
import { ConfigManager, ProviderConfig } from "../background/configManager";
import { logWithTimestamp } from "../background/utils";
import { Page } from "playwright-crx";

/**
 * SubAgent is a simplified agent focused on content extraction tasks
 */
export class SubAgent {
  private llmProvider: LLMProvider;

  /**
   * Create a new ExtractAgent
   */
    constructor(config: ProviderConfig, provider: LLMProvider) {
    // Initialize LLM provider with the provided configuration
     this.llmProvider = provider;
  }

  /**
   * Extract content using the LLM provider
   */

  /**
   * Execute prompt with optional streaming support
   */
  async executPrompt(
    prompt: string,
  ): Promise<string> {
    // const adapter = new SubAgentCallbackAdapter(callbacks, isStreaming);
    // const adaptedCallbacks = adapter.adaptedCallbacks;
    
    try {
      const stream = this.llmProvider.createMessage('', [{ role: 'user', content: prompt }]);
      let result = '';
      
      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.text) {
          result += chunk.text;
          // if (adaptedCallbacks.onLlmChunk) {
          //   adaptedCallbacks.onLlmChunk(chunk.text);
          // }
        }
      }

      // adaptedCallbacks.onLlmOutput(result);
      // adaptedCallbacks.onComplete();
      return result;
    } catch (error) {
      // if (adaptedCallbacks.onError) {
      //   adaptedCallbacks.onError(error);
      // }
      logWithTimestamp(`Failed to executPrompt ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Create a new SubAgent
 */
export async function createSubAgent(
  providerConfig: ProviderConfig
): Promise<SubAgent> {
  
  // Create the provider with the configuration
  const provider = await createProvider(providerConfig.provider, {
    apiKey: providerConfig.apiKey,
    apiModelId: providerConfig.apiModelId,
    baseUrl: providerConfig.baseUrl,
    thinkingBudgetTokens: providerConfig.thinkingBudgetTokens,
    dangerouslyAllowBrowser: true,
  });
  
  return new SubAgent(providerConfig,provider);
}