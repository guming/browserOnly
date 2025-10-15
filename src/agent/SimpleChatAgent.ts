import { LLMProvider, StreamChunk } from "../models/providers/types";
import { TokenTrackingService } from "../tracking/tokenTrackingService";
import { trimHistory } from "./TokenManager";

/**
 * Callback interface for simple chat execution
 */
export interface SimpleChatCallbacks {
  onChunk?: (chunk: string) => void;
  onComplete: (fullResponse: string) => void;
  onError?: (error: any) => void;
}

/**
 * SimpleChatAgent is a lightweight chat agent without tool support.
 * It only handles basic LLM conversations with streaming support.
 */
export class SimpleChatAgent {
  private llmProvider: LLMProvider;
  private systemPrompt: string;
  private conversationHistory: any[] = [];
  private cancelled: boolean = false;

  /**
   * Create a new SimpleChatAgent
   * @param llmProvider The LLM provider to use
   * @param systemPrompt The system prompt for the agent
   */
  constructor(llmProvider: LLMProvider, systemPrompt: string = "") {
    this.llmProvider = llmProvider;
    this.systemPrompt = systemPrompt;
  }

  /**
   * Update the system prompt
   */
  setSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
  }

  /**
   * Get the current system prompt
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Cancel the current execution
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Reset the cancel flag
   */
  resetCancel(): void {
    this.cancelled = false;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   */
  getHistory(): any[] {
    return [...this.conversationHistory];
  }

  /**
   * Set conversation history (useful for restoring previous conversations)
   */
  setHistory(history: any[]): void {
    this.conversationHistory = [...history];
  }

  /**
   * Track token usage from stream chunks
   */
  private trackTokenUsage(
    chunk: StreamChunk,
    inputTokens: number,
    outputTokens: number,
    tokenTracker: TokenTrackingService
  ): { updatedInputTokens: number; updatedOutputTokens: number } {
    let updatedInputTokens = inputTokens;
    let updatedOutputTokens = outputTokens;

    // Handle input tokens (only from message_start)
    if (chunk.inputTokens) {
      updatedInputTokens = chunk.inputTokens;
      tokenTracker.trackInputTokens(updatedInputTokens, {
        write: chunk.cacheWriteTokens,
        read: chunk.cacheReadTokens,
      });
    }

    // Track output tokens
    if (chunk.outputTokens) {
      const newOutputTokens = chunk.outputTokens;

      // Only track the delta (new tokens)
      if (newOutputTokens > updatedOutputTokens) {
        const delta = newOutputTokens - updatedOutputTokens;
        tokenTracker.trackOutputTokens(delta);
        updatedOutputTokens = newOutputTokens;
      }
    }

    return { updatedInputTokens, updatedOutputTokens };
  }

  /**
   * Send a message and get a response with streaming support
   * @param message The user message
   * @param callbacks Callbacks for handling response
   * @param useHistory Whether to use conversation history (default: true)
   */
  async chat(
    message: string,
    callbacks: SimpleChatCallbacks,
    useHistory: boolean = true
  ): Promise<void> {
    // Reset cancel flag at the start
    this.resetCancel();

    try {
      // Build messages array
      const messages: any[] = useHistory
        ? [...this.conversationHistory, { role: "user", content: message }]
        : [{ role: "user", content: message }];

      // Stream the response
      let accumulatedText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      const tokenTracker = TokenTrackingService.getInstance();

      // Create stream (no tools passed)
      const stream = this.llmProvider.createMessage(
        this.systemPrompt,
        messages,
        [] // No tools
      );

      // Process stream
      for await (const chunk of stream) {
        // Check for cancellation
        if (this.cancelled) {
          callbacks.onComplete(accumulatedText);
          return;
        }

        // Track token usage
        if (chunk.type === "usage") {
          const result = this.trackTokenUsage(
            chunk,
            inputTokens,
            outputTokens,
            tokenTracker
          );
          inputTokens = result.updatedInputTokens;
          outputTokens = result.updatedOutputTokens;
        }

        // Handle text chunks
        if (chunk.type === "text" && chunk.text) {
          const textChunk = chunk.text;
          accumulatedText += textChunk;

          // Send chunk to callback if streaming is enabled
          if (callbacks.onChunk) {
            callbacks.onChunk(textChunk);
          }
        }
      }

      // Update conversation history if using history
      if (useHistory) {
        this.conversationHistory.push({ role: "user", content: message });
        this.conversationHistory.push({
          role: "assistant",
          content: accumulatedText,
        });

        // Trim history to prevent it from growing too large
        this.conversationHistory = trimHistory(this.conversationHistory);
      }

      // Call completion callback with full response
      callbacks.onComplete(accumulatedText);
    } catch (error) {
      console.error("SimpleChatAgent error:", error);
      if (callbacks.onError) {
        callbacks.onError(error);
      } else {
        // If no error callback provided, call completion with empty response
        callbacks.onComplete("");
      }
    }
  }

  /**
   * Send a message and get a response without streaming (waits for full response)
   * @param message The user message
   * @param useHistory Whether to use conversation history (default: true)
   * @returns The full response text
   */
  async chatSync(message: string, useHistory: boolean = true): Promise<string> {
    return new Promise((resolve, reject) => {
      this.chat(
        message,
        {
          onComplete: (fullResponse) => resolve(fullResponse),
          onError: (error) => reject(error),
        },
        useHistory
      );
    });
  }
}

/**
 * Factory function to create a SimpleChatAgent
 * @param llmProvider The LLM provider to use
 * @param systemPrompt Optional system prompt
 */
export function createSimpleChatAgent(
  llmProvider: LLMProvider,
  systemPrompt: string = ""
): SimpleChatAgent {
  return new SimpleChatAgent(llmProvider, systemPrompt);
}
