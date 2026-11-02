import { operatorTaskMessages } from "./TaskContext";
import { LLMProvider, StreamChunk, NativeToolCall } from "../models/providers/types";
import { TokenTrackingService } from "../tracking/tokenTrackingService";
import { ErrorHandler } from "./ErrorHandler";
import { MemoryManager } from "./MemoryManager";
import { PromptManager } from "./PromptManager";
import { trimHistory, trimNativeHistory } from "./TokenManager";
import { ToolManager } from "./ToolManager";
import { requestApproval } from "./approvalManager";
import type { ToolTraceEvent } from "../workflows/types";

import { decodeToolResult } from "./ToolResult";
import { ExecutionBudget } from "./ExecutionBudget";
import { parseFinish, type ExecutionOutcome } from "./ExecutionOutcome";

/**
 * Callback interface for execution
 */
export interface ExecutionCallbacks {
  executionContext?: { runId: string; workflowId: string; tabId: number; ownerTabId: number; windowId: number; scheduled?: boolean };
  onExecutionEnd?: (status: 'completed' | 'cancelled' | 'failed', error?: string) => void;
  onExecutionOutcome?: (outcome: ExecutionOutcome) => void;
  onModelUsage?: (inputTokens: number, outputTokens: number) => void;
  onLlmChunk?: (s: string) => void;
  onLlmOutput: (s: string) => void | Promise<void>;
  onToolOutput: (s: string) => void;
  onComplete: () => void;
  onError?: (error: any) => void;
  onToolStart?: (toolName: string, toolInput: string) => void;
  onToolEnd?: (result: string) => void;
  onToolEvent?: (event: ToolTraceEvent) => void;
  onSegmentComplete?: (segment: string) => void;
  onFallbackStarted?: () => void;
}

/**
 * Adapter for handling callbacks in both streaming and non-streaming modes
 */
class CallbackAdapter {
  private originalCallbacks: ExecutionCallbacks;
  private isStreaming: boolean;


  constructor(callbacks: ExecutionCallbacks, isStreaming: boolean) {
    this.originalCallbacks = callbacks;
    this.isStreaming = isStreaming;
  }

  get adaptedCallbacks(): ExecutionCallbacks {
    return {
      onLlmChunk: this.handleLlmChunk.bind(this),
      onLlmOutput: this.originalCallbacks.onLlmOutput,
      onToolOutput: this.originalCallbacks.onToolOutput,
      onComplete: this.handleComplete.bind(this),
      executionContext: this.originalCallbacks.executionContext,
      onExecutionEnd: this.originalCallbacks.onExecutionEnd,
      onExecutionOutcome: this.originalCallbacks.onExecutionOutcome,
      onModelUsage: this.originalCallbacks.onModelUsage,
      onError: this.originalCallbacks.onError,
      onToolStart: this.originalCallbacks.onToolStart,
      onToolEnd: this.originalCallbacks.onToolEnd,
      onToolEvent: this.originalCallbacks.onToolEvent,
      onSegmentComplete: this.originalCallbacks.onSegmentComplete,
      onFallbackStarted: this.originalCallbacks.onFallbackStarted
    };
  }

  private handleLlmChunk(chunk: string): void {
    if (this.isStreaming && this.originalCallbacks.onLlmChunk) {
      // Pass through in streaming mode
      this.originalCallbacks.onLlmChunk(chunk);
    }
  }

  private handleComplete(): void {
    this.originalCallbacks.onComplete();
  }
}

/**
 * ExecutionEngine handles streaming execution logic, non-streaming execution logic,
 * and fallback mechanisms.
 */
export class ExecutionEngine {
  private llmProvider: LLMProvider;
  private toolManager: ToolManager;
  private promptManager: PromptManager;
  private memoryManager: MemoryManager;
  private errorHandler: ErrorHandler;
  private executing = false;

  constructor(
    llmProvider: LLMProvider,
    toolManager: ToolManager,
    promptManager: PromptManager,
    memoryManager: MemoryManager,
    errorHandler: ErrorHandler
  ) {
    this.llmProvider = llmProvider;
    this.toolManager = toolManager;
    this.promptManager = promptManager;
    this.memoryManager = memoryManager;
    this.errorHandler = errorHandler;
  }

  /**
   * Some OpenAI-compatible gateways expose their internal DSML closing token
   * as text instead of returning a normal </tool> tag. Normalize that known
   * transport artifact before attempting to detect or parse a tool call.
   */
  private normalizeToolCallMarkup(value: string): string {
    return value.replace(
      /<\/[|｜]{2}\s*DSML\s*[|｜]{2}\s*parameter\s*>/gi,
      '</tool>'
    )
      // Some reasoning models emit the XML protocol as Markdown-escaped text.
      // Normalize only protocol punctuation; selector escaping inside <input>
      // must otherwise remain untouched.
      .replace(/\\([<>_])/g, '$1');
  }

  private hasMalformedToolIntent(value: string): boolean {
    const normalized = this.normalizeToolCallMarkup(value);
    return /<\/?(?:tool|input|requires_approval)\b/i.test(normalized)
      || /(?:browser|lookup|save|delete|clear)\\?_\w+/i.test(value)
        && /requires\\?_approval/i.test(value);
  }

  private hasUnfinishedActionNarration(value: string): boolean {
    const text = value.trim();
    if (/^\s*[-*]\s*\[\s\]\s+/m.test(text)) return true;

    // Models sometimes narrate the next browser action, then end the stream
    // before emitting the corresponding tool call. Keep this deliberately
    // narrow so ordinary final prose such as "let me know" still completes.
    return /\b(?:now|next|then)\s*,?\s*(?:let me|i(?:'ll| will)|we(?:'ll| will))\s+(?!know\b)(?:click|type|enter|search|open|navigate|select|choose|submit|press|inspect|find|check|verify|scroll|add|fill)\b/i.test(text)
      || /\blet me\s+(?!know\b)(?:click|type|enter|search|open|navigate|select|choose|submit|press|inspect|find|check|verify|scroll|add|fill)\b/i.test(text);
  }

  /**
   * Execute a browser reading tool with a narrow extension-context fallback.
   * Some Chromium extension pages do not expose `window` inside page.evaluate.
   * In that case a plain DOM text read still provides useful input to the
   * expert instead of aborting the entire conversation.
   */
  private async executeToolWithContextFallback(
    toolName: string,
    toolInput: string,
    execute: () => Promise<string>
  ): Promise<string> {
    let result: string;

    try {
      result = await execute();
    } catch (error) {
      if (!this.isWindowContextError(error) || !this.isPageReadTool(toolName)) {
        throw error;
      }
      return this.readPageTextFallback(toolInput, toolName);
    }

    if (this.isWindowContextError(result) && this.isPageReadTool(toolName)) {
      return this.readPageTextFallback(toolInput, toolName);
    }

    return result;
  }

  private isPageReadTool(toolName: string): boolean {
    return toolName === 'browser_read_text_enhanced'
      || toolName === 'browser_read_text'
      || toolName === 'browser_read_main';
  }

  private isWindowContextError(value: unknown): boolean {
    return /window is not defined/i.test(value instanceof Error ? value.message : String(value));
  }

  private async readPageTextFallback(input: string, failedToolName: string): Promise<string> {
    const fallbackTool = this.toolManager.findTool('browser_read_text');
    if (!fallbackTool || failedToolName === 'browser_read_text') {
      return `Unable to read the page in the current browser context: window is not defined. Please provide the page text or reload the tab.`;
    }

    try {
      const result = await fallbackTool.func(input);
      if (this.isWindowContextError(result)) {
        return `Unable to read the page in the current browser context: window is not defined. Please provide the page text or reload the tab.`;
      }
      return `[Fallback: plain page text]\n${result}`;
    } catch (error) {
      return `Unable to read the page after fallback: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Main execution method with fallback support
   */
  async executePromptWithFallback(
    prompt: string,
    callbacks: ExecutionCallbacks,
    initialMessages: any[] = [],
    role: string = 'operator'
  ): Promise<void> {
    const streamingSupported = await this.errorHandler.isStreamingSupported();
    const isStreaming = streamingSupported && callbacks.onLlmChunk !== undefined;

    try {
      // Use the execution method with appropriate streaming mode
      await this.executePrompt(prompt, callbacks, initialMessages, isStreaming, role);
    } catch (error) {
      console.warn("Execution failed, attempting fallback:", error);

      // Notify about fallback before switching modes
      if (callbacks.onFallbackStarted) {
        callbacks.onFallbackStarted();
      }

      // Check if this is a retryable error (rate limit or overloaded)
      if (this.errorHandler.isRetryableError(error)) {
        console.log("Retryable error detected in fallback handler:", error);
        // Ensure the error callback is called even during fallback
        if (callbacks.onError) {
          callbacks.onError(error);
        }
      }

      // Continue with fallback using non-streaming mode
      await this.executePrompt(prompt, callbacks, initialMessages, false, role);
    }
  }

  /**
   * Helper function to decode escaped HTML entities in a string
   * @param text The text to decode
   * @returns The decoded text
   */
  private decodeHtmlEntities(text: string): string {
    // Replace Unicode escape sequences with actual characters
    return text
      .replace(/\\u003c/g, '<')
      .replace(/\\u003e/g, '>')
      .replace(/\u003c/g, '<')
      .replace(/\u003e/g, '>');
  }

  /**
   * Initialize message history with the prompt
   */
  private initializeMessages(prompt: string, initialMessages: any[]): any[] {
    // Use initial messages if provided, otherwise start with just the prompt
    const messages: any[] = initialMessages.length > 0
      ? [...initialMessages]
      : [{ role: "user", content: prompt }];

    // If we have initial messages and the last one isn't the current prompt,
    // add the current prompt
    if (initialMessages.length > 0 &&
        (messages[messages.length - 1].role !== "user" ||
         messages[messages.length - 1].content !== prompt)) {
      messages.push({ role: "user", content: prompt });
    }

    return messages;
  }

  /**
   * Track token usage from stream chunks
   */
  private trackTokenUsage(
    chunk: StreamChunk,
    inputTokens: number,
    outputTokens: number,
    tokenTracker: TokenTrackingService
  ): { updatedInputTokens: number, updatedOutputTokens: number } {
    let updatedInputTokens = inputTokens;
    let updatedOutputTokens = outputTokens;

    // Debug log to help diagnose token tracking issues
    console.debug(`Token update: input=${chunk.inputTokens || 0}, output=${chunk.outputTokens || 0}, cacheWrite=${chunk.cacheWriteTokens || 0}, cacheRead=${chunk.cacheReadTokens || 0}`);

    // Handle input tokens (only from message_start)
    if (chunk.inputTokens || chunk.cacheWriteTokens || chunk.cacheReadTokens) {
      updatedInputTokens = chunk.inputTokens ?? 0;
      // Track input tokens with cache tokens if available
      tokenTracker.trackInputTokens(
        updatedInputTokens,
        {
          write: chunk.cacheWriteTokens,
          read: chunk.cacheReadTokens
        }
      );
    }

    // Always track output tokens (from both message_start and message_delta)
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
   * Process the LLM stream and handle streaming chunks
   */
  private async processLlmStream(
    messages: any[],
    adaptedCallbacks: ExecutionCallbacks,
    role:string = 'operator'
  ): Promise<{ accumulatedText: string, toolCallDetected: boolean, nativeToolCall?: NativeToolCall; reasoningContent: string }> {
    let accumulatedText = "";
    let streamBuffer = "";
    let toolCallDetected = false;
    let nativeToolCall: NativeToolCall | undefined;
    let reasoningContent = '';

    // Get tools from the ToolManager
     // 处理带连字符和不带连字符的角色字符串
  let baseRole: string;
  let selectedOption: string | undefined;

  if (role.includes('-')) {
    // 情况1: 带连字符的角色 (如 "notebooklm-option1")
    const roleParts = role.split('-');
    baseRole = roleParts[0]; // 'notebooklm'
    selectedOption = roleParts[1]; // 具体选项值
  } else {
    baseRole = role; // 'operator'
    selectedOption = undefined; // 没有额外选项
  }

  console.log('Base role:', baseRole); // 'notebooklm' 或 'operator'
  console.log('Selected option:', selectedOption); // 具体选项值 或 undefined

  // Get tools from the ToolManager
  const tools = baseRole === 'reflection' ? [] : this.toolManager.getTools();

  const systemPrompt = baseRole === 'reflection'
    ? 'Describe only the completed task and captured successful steps supplied by the user. Return one JSON object with a taskDescription string. Do not execute browser tools, inspect pages, resume tasks, or use earlier conversation history. Do not emit XML completion wrappers.'
    : this.promptManager.getSystemPrompt(baseRole, selectedOption);

    // Use provider interface instead of direct Anthropic API
    const stream = this.llmProvider.createMessage(
      systemPrompt,
      messages,
      tools
    );

    // Track token usage
    let inputTokens = 0;
    let outputTokens = 0;
    const tokenTracker = TokenTrackingService.getInstance();

    for await (const chunk of stream) {
      if (this.errorHandler.isExecutionCancelled()) break;

      // Track token usage
      if (chunk.type === 'usage') {
        const result = this.trackTokenUsage(chunk, inputTokens, outputTokens, tokenTracker);
        inputTokens = result.updatedInputTokens;
        outputTokens = result.updatedOutputTokens;
      }

      if (chunk.type === 'reasoning' && typeof chunk.reasoning === 'string') {
        reasoningContent += chunk.reasoning;
        continue;
      }
      if (chunk.type === 'tool_call') {
        const call = chunk.toolCall;
        if (!call || typeof call.name !== 'string' || typeof call.input !== 'string' || typeof call.requiresApproval !== 'boolean') throw new Error('Invalid native tool event');
        if (nativeToolCall) throw new Error('Multiple native tool events in one response');
        nativeToolCall = call;
        toolCallDetected = true;
        adaptedCallbacks.onToolStart?.(call.name, call.input);
        continue;
      }
      // Handle text chunks
      if (chunk.type === 'text' && chunk.text) {
        const textChunk = chunk.text;
        accumulatedText += textChunk;
        streamBuffer += textChunk;

        // Normalize the whole buffer because the malformed closing token may
        // be split across multiple streaming chunks.
        if (this.llmProvider.toolCallFormat !== 'native') streamBuffer = this.normalizeToolCallMarkup(streamBuffer);

        // Only look for complete tool calls with all three required tags
        const completeToolCallRegex = /(```(?:xml|bash)\s*)?<tool>(.*?)<\/tool>\s*<input>([\s\S]*?)<\/input>\s*<requires_approval>(.*?)<\/requires_approval>(\s*```)?/;
        
        // Try to match the complete tool call pattern
        const completeToolCallMatch = streamBuffer.match(completeToolCallRegex);

        // Only process complete tool calls with all three required tags
        if (completeToolCallMatch && !toolCallDetected && this.llmProvider.toolCallFormat !== 'native') {
          toolCallDetected = true;
          console.log("Complete tool call detected:", completeToolCallMatch);

          // Extract the tool call with requires_approval value
          const [fullMatch, codeBlockStart, toolName, toolInput, requiresApprovalRaw] = completeToolCallMatch;

          // Find the start of the tool call
          const matchIndex = codeBlockStart
            ? (streamBuffer.indexOf("```xml") !== -1
               ? streamBuffer.indexOf("```xml")
               : streamBuffer.indexOf("```bash"))
            : streamBuffer.indexOf("<tool>");

          // Get text before the tool call
          const textBeforeToolCall = streamBuffer.substring(0, matchIndex);

          // Finalize the current segment
          if (textBeforeToolCall.trim() && adaptedCallbacks.onSegmentComplete) {
            adaptedCallbacks.onSegmentComplete(textBeforeToolCall);
          }

          // Signal that a tool call is starting
          if (adaptedCallbacks.onToolStart) {
            adaptedCallbacks.onToolStart(toolName.trim(), toolInput.trim());
          }

          // Clear the buffer
          streamBuffer = "";

          // Don't send any more chunks until tool execution is complete
          break;
        }

        // If no tool call detected yet, continue sending chunks
        const start = streamBuffer.trimStart();
        const isFinish = (role === 'operator' || role?.startsWith('operator-')) &&
          ('<finish'.startsWith(start) || start.startsWith('<finish'));
        if (!toolCallDetected && !isFinish && adaptedCallbacks.onLlmChunk) {
          adaptedCallbacks.onLlmChunk(textChunk);
        }
      }
    }

    // After streaming completes, process the full response
    console.log("Streaming completed. Accumulated text length:", accumulatedText.length);

    // Decode any escaped HTML entities in the accumulated text
    if (this.llmProvider.toolCallFormat !== 'native') {
      accumulatedText = this.decodeHtmlEntities(accumulatedText);
      accumulatedText = this.normalizeToolCallMarkup(accumulatedText);
    }
    console.log("Decoded HTML entities in accumulated text");

    adaptedCallbacks.onModelUsage?.(inputTokens, outputTokens);
    const finish = (role === 'operator' || role?.startsWith('operator-')) ? parseFinish(accumulatedText) : undefined;
    if (accumulatedText.trim()) await adaptedCallbacks.onLlmOutput(finish?.message || accumulatedText);

    return { accumulatedText, toolCallDetected, nativeToolCall, reasoningContent };
  }

  /**
   * Execute prompt with support for both streaming and non-streaming modes
   */
  async executePrompt(
    prompt: string,
    callbacks: ExecutionCallbacks,
    initialMessages: any[] = [],
    isStreaming: boolean,
    role:string
  ): Promise<void> {
    if (this.executing) {
      const outcome: ExecutionOutcome = { status: 'blocked', reason: 'EXECUTION_BUSY', message: 'A task is already running in this browser window. Stop it or wait for completion before starting another.' };
      callbacks.onLlmOutput(outcome.message!);
      callbacks.onExecutionOutcome?.(outcome);
      callbacks.onExecutionEnd?.('failed', outcome.message);
      callbacks.onComplete();
      return;
    }
    this.executing = true;
    // Create adapter to handle streaming vs non-streaming
    const adapter = new CallbackAdapter(callbacks, isStreaming);
    const adaptedCallbacks = adapter.adaptedCallbacks;

    // Reset cancel flag at the start of execution
    this.errorHandler.resetCancel();
    try {
      // Initialize messages with the prompt
      let messages = role === 'reflection' || role === 'operator' || role?.startsWith('operator-')
        ? operatorTaskMessages(prompt, initialMessages)
        : this.initializeMessages(prompt, initialMessages);

      let done = false;
      const budget = new ExecutionBudget();
      let outcome: ExecutionOutcome = { status: 'completed', reason: 'MODEL_FINAL' };
      let finishRepair = false;
      const stop = (reason: ExecutionOutcome['reason']) => {
        outcome = { status: 'failed', reason, message: `Execution stopped: ${reason}.` };
      };
      const repair = () => {
        const reason = budget.repair();
        if (reason) { stop(reason); return false; }
        return true;
      };

      while (!done && !this.errorHandler.isExecutionCancelled()) {
        const requestStop = budget.request();
        if (requestStop) { stop(requestStop); break; }
        try {
          // Check for cancellation before each major step
          if (this.errorHandler.isExecutionCancelled()) break;

          // ── 1. Call LLM with streaming ───────────────────────────────────────
          let response: { accumulatedText: string; toolCallDetected: boolean; nativeToolCall?: NativeToolCall; reasoningContent: string } | undefined;
          let providerAttempt = 0;
          while (true) {
            try { response = await this.processLlmStream(messages, adaptedCallbacks, role); break; }
            catch (error) {
              if (this.errorHandler.isExecutionCancelled()) break;
              const retryable = this.errorHandler.isRetryableError(error);
              const status = (error as { status?: number })?.status;
              if ((!retryable && (!isStreaming || providerAttempt > 0 || typeof status === 'number' && status >= 400 && status < 500)) || providerAttempt >= 5) throw error;
              adaptedCallbacks.onFallbackStarted?.();
              if (retryable) adaptedCallbacks.onError?.(error);
              const delay = retryable ? this.errorHandler.calculateBackoffTime(error, providerAttempt) : 0;
              if (delay) await new Promise(resolve => setTimeout(resolve, delay));
              providerAttempt++;
              const retryStop = budget.request();
              if (retryStop) { stop(retryStop); break; }
            }
          }
          if (!response) break;
          const { accumulatedText, nativeToolCall, reasoningContent } = response;
          // Provider continuation metadata stays in the API history, never the UI.
          const assistantMessage = (content: string = accumulatedText) => ({ role: 'assistant', content,
            ...(this.llmProvider.toolCallFormat === 'native' ? { reasoning_content: reasoningContent } : {}) });
          console.log('accumulatedText',accumulatedText, role);
          
          // Check for cancellation after LLM response
          if (this.errorHandler.isExecutionCancelled()) break;

          // Reflection is a tools-free transformation of the captured trace.
          if (role === 'reflection') {
            if (nativeToolCall) throw new Error('Reflection cannot execute tools');
            done = true; break;
          }

          // Providers currently surface invalid native tool arguments as text.
          // This is a failed invocation, not a successful final response.
          if (/^Error: Failed to parse tool call\. Please try again\.$/m.test(accumulatedText)) {
            if (!repair()) break;
            messages.push(
              assistantMessage(),
              { role: "user", content: this.llmProvider.toolCallFormat === 'native' ? 'The provider could not parse your function arguments. Use exactly one native function call with valid JSON containing input:string and requires_approval:boolean. Escape quotes using JSON syntax. Do not emit XML or claim success before the tool succeeds.' : 'The provider could not parse your tool arguments. Continue the original task and emit exactly one complete tool call with tool, input and requires_approval tags; structured tool input must be valid JSON. Do not report the task complete before the tool succeeds.' }
            );
            messages = this.llmProvider.toolCallFormat === 'native' ? trimNativeHistory(messages) : trimHistory(messages);
            continue;
          }

          // Check for incomplete or malformed tool calls
          // This regex looks for tool calls that have <tool> and <input> but are missing <requires_approval>
          const incompleteApprovalRegex = /<tool>(.*?)<\/tool>\s*<input>([\s\S]*?)<\/input>(?!\s*<requires_approval>)/;
          const incompleteApprovalMatch = accumulatedText.match(incompleteApprovalRegex);

          // Check for interrupted tool calls (has input tag but interrupted during requires_approval)
          const interruptedToolRegex = /<tool>(.*?)<\/tool>\s*<input>([\s\S]*?)<\/input>\s*<requires(_approval)?$/;
          const interruptedToolMatch = accumulatedText.match(interruptedToolRegex);

          // Handle incomplete tool calls with missing requires_approval tag
          if (this.llmProvider.toolCallFormat !== 'native' && !nativeToolCall && incompleteApprovalMatch && !accumulatedText.includes("<requires_approval>")) {
            if (!repair()) break;
            const toolName = incompleteApprovalMatch[1].trim();
            const toolInput = incompleteApprovalMatch[2].trim();

            console.log("Detected incomplete tool call missing requires_approval tag:", incompleteApprovalMatch[0]);

            // Add a message to prompt the LLM to use the complete format
            messages.push(
              assistantMessage(),
              {
                role: "user",
                content: `Error: Incomplete tool call format. You provided <tool>${toolName}</tool> and <input>${toolInput}</input> but no <requires_approval> tag. Please use the complete format with all three required tags:

<tool>tool_name</tool>
<input>arguments here</input>
<requires_approval>true or false</requires_approval>

The <requires_approval> tag is mandatory. Set it to "true" for purchases, data deletion, messages visible to others, sensitive-data forms, or any risky action. If unsure, set it to "true".`
              }
            );
            continue; // Continue to the next iteration
          }
          // Handle interrupted tool calls
          else if (this.llmProvider.toolCallFormat !== 'native' && !nativeToolCall && interruptedToolMatch &&
              !interruptedToolMatch[0].includes("</requires_approval>") &&
              (interruptedToolMatch[0].endsWith("<requires") ||
               interruptedToolMatch[0].endsWith("<requires_approval"))) {
            if (!repair()) break;

            const toolName = interruptedToolMatch[1].trim();
            const toolInput = interruptedToolMatch[2].trim();

            console.log("Detected interrupted tool call with partial requires_approval tag:", interruptedToolMatch[0]);

            // Instead of assuming approval, ask the LLM to complete the tool call properly
            messages.push(
              assistantMessage(),
              {
                role: "user",
                content: `Error: Your tool call was interrupted. Please provide the complete tool call with all three required tags:

<tool>${toolName}</tool>
<input>${toolInput}</input>
<requires_approval>true or false</requires_approval>

The <requires_approval> tag is mandatory. Set it to "true" for purchases, data deletion, messages visible to others, sensitive-data forms, or any risky action. If unsure, set it to "true".`
              }
            );
            continue; // Continue to the next iteration
          }

          // ── 2. Parse for tool invocation ─────────────────────────────────────
          // Only look for complete tool calls with all three required tags
          const toolMatch = nativeToolCall
            ? ['', nativeToolCall.name, nativeToolCall.input, String(nativeToolCall.requiresApproval)]
            : this.llmProvider.toolCallFormat === 'native' ? null : accumulatedText.match(
            /<tool>(.*?)<\/tool>\s*<input>([\s\S]*?)<\/input>\s*<requires_approval>(.*?)<\/requires_approval>/
          );

          // Check for various types of incomplete tool calls
          // 1. Tool tag without input tag
          const missingInputMatch = accumulatedText.match(/<tool>(.*?)<\/tool>(?!\s*<input>)/);
          // 2. Tool and input tags without requires_approval tag
          const missingApprovalMatch = accumulatedText.match(/<tool>(.*?)<\/tool>\s*<input>([\s\S]*?)<\/input>(?!\s*<requires_approval>)/);

          if (missingInputMatch !== null && toolMatch === null && this.llmProvider.toolCallFormat !== 'native') {
            if (!repair()) break;
            // Handle tool call missing input tag
            const toolName = missingInputMatch[1].trim();
            adaptedCallbacks.onToolOutput(`⚠️ Incomplete tool call detected: ${toolName} (missing input and requires_approval tags)`);

            // Add a message to prompt the LLM to complete the tool call with all required tags
            messages.push(
              assistantMessage(),
              {
                role: "user",
                content: `Error: Incomplete tool call. You provided <tool>${toolName}</tool> but are missing the <input> and <requires_approval> tags. Please provide the complete tool call with all three required tags:

<tool>${toolName}</tool>
<input>arguments here</input>
<requires_approval>true or false</requires_approval>

The <requires_approval> tag is mandatory. Set it to "true" for purchases, data deletion, messages visible to others, sensitive-data forms, or any risky action. If unsure, set it to "true".`
              }
            );
            continue; // Continue to the next iteration
          } else if (missingApprovalMatch !== null && toolMatch === null && this.llmProvider.toolCallFormat !== 'native') {
            if (!repair()) break;
            // Handle tool call missing requires_approval tag
            const toolName = missingApprovalMatch[1].trim();
            const toolInput = missingApprovalMatch[2].trim();
            adaptedCallbacks.onToolOutput(`⚠️ Incomplete tool call detected: ${toolName} (missing requires_approval tag)`);

            // Add a message to prompt the LLM to complete the tool call with all required tags
            messages.push(
              assistantMessage(),
              {
                role: "user",
                content: `Error: Incomplete tool call. You provided <tool>${toolName}</tool> and <input>${toolInput}</input> but are missing the <requires_approval> tag. Please provide the complete tool call with all three required tags:

<tool>${toolName}</tool>
<input>${toolInput}</input>
<requires_approval>true or false</requires_approval>

The <requires_approval> tag is mandatory. Set it to "true" for purchases, data deletion, messages visible to others, sensitive-data forms, or any risky action. If unsure, set it to "true".`
              }
            );
            continue; // Continue to the next iteration
          }

          if (!toolMatch) {
            const declaredFinish = (role === 'operator' || role?.startsWith('operator-')) ? parseFinish(accumulatedText) : undefined;
            if (declaredFinish) { outcome = declaredFinish; done = true; break; }
            // A malformed/escaped tool call is not a final answer. Ask the
            // model to repair its protocol and keep the execution loop alive.
            if (this.hasMalformedToolIntent(accumulatedText) || this.hasUnfinishedActionNarration(accumulatedText)) {
              if (!repair()) break;
              const malformedToolCall = this.hasMalformedToolIntent(accumulatedText);
              messages.push(
                assistantMessage(),
                {
                  role: "user",
                  content: this.llmProvider.toolCallFormat === 'native'
                    ? 'Your intended action did not produce a valid native function call. Continue using the provided functions with JSON input:string and requires_approval:boolean. Do not emit XML tool tags or a progress-only response.'
                    : malformedToolCall
                    ? `Error: A tool call was intended but its XML is malformed or Markdown-escaped. Continue the original task and emit exactly one valid tool call using this format:\n\n<tool>tool_name</tool>\n<input>arguments here</input>\n<requires_approval>true or false</requires_approval>\n\nDo not escape the angle brackets or underscores. Do not stop until the original task is verified complete.`
                    : `You described a next browser action but did not emit its tool call. Continue the original task now by emitting exactly one valid tool call. Do not provide another progress-only message, and do not stop until the original task is verified complete.`
                }
              );
              messages = this.llmProvider.toolCallFormat === 'native' ? trimNativeHistory(messages) : trimHistory(messages);
              continue;
            }
            if (role === 'operator' || role?.startsWith('operator-')) {
              const finish = parseFinish(accumulatedText);
              if (finish) { outcome = finish; }
              else if (!finishRepair) {
                finishRepair = true;
                messages.push(assistantMessage(), { role: 'user', content: 'Continue with a tool call if work remains. Otherwise wrap your full answer to the original request in <finish status="completed">...</finish>, or your useful partial answer and blocker in <finish status="blocked">...</finish>. Preserve the requested detail, language, and Markdown formatting; the status wrapper must not replace the answer with an execution recap. Do not claim success without verification.' });
                messages = this.llmProvider.toolCallFormat === 'native' ? trimNativeHistory(messages) : trimHistory(messages);
                continue;
              } else { stop('PROTOCOL_ERROR'); }
            }
            done = true;
            break;
          }

          // Extract tool information from the complete tool call
          let toolName, toolInput, llmRequiresApproval;

          if (toolMatch) {
            const [, toolNameRaw, toolInputRaw, requiresApprovalRaw] = toolMatch;
            toolName = toolNameRaw.trim();
            toolInput = toolInputRaw.trim();
            llmRequiresApproval = requiresApprovalRaw.trim().toLowerCase() === 'true';
          } else {
            // No valid tool call found, task is complete
            done = true;
            break;
          }
          budget.parsed();
          const tool = this.toolManager.findTool(toolName);

          // Check if the LLM has marked this as requiring approval
          const requiresApproval = llmRequiresApproval;
          const reason = llmRequiresApproval ? "The AI assistant has determined this action requires your approval." : "";

          if (!tool) {
            messages.push(
              assistantMessage(),
              {
                role: "user",
                content: `Error: tool "${toolName}" not found. Available: ${this.toolManager.getTools()
                  .map((t) => t.name)
                  .join(", ")}`,
              }
            );
            continue;
          }

          // Check for cancellation before tool execution
          if (this.errorHandler.isExecutionCancelled()) break;

          // Check before announcing execution; a blocked call was not run.
          const callStop = budget.beforeCall(toolName, toolInput);
          if (callStop) { stop(callStop); break; }
          // ── 3. Execute tool ──────────────────────────────────────────────────
          adaptedCallbacks.onToolOutput(`🕹️ tool: ${toolName} | args: ${toolInput}`);

          let result: string;
          const traceEvent: ToolTraceEvent = {
            executionId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            toolName,
            input: this.parseToolInput(toolInput),
            startedAt: Date.now()
          };

          if (requiresApproval) {
            if (adaptedCallbacks.executionContext?.scheduled) throw new Error('APPROVAL_REQUIRED: Run this task manually to review and approve its actions.');
            // Notify the user that approval is required
            adaptedCallbacks.onToolOutput(`⚠️ This action requires approval: ${reason}`);

            // Get the current tab ID from chrome.tabs API
            const scope = adaptedCallbacks.executionContext;
            const tabId = scope?.tabId ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id ?? 0;

            try {
              // Request approval from the user
              const approved = await requestApproval(tabId, toolName, toolInput, reason, scope?.windowId,
                scope ? { runId: scope.runId, workflowId: scope.workflowId, executionTabId: scope.tabId, ownerTabId: scope.ownerTabId } : undefined);

              if (approved) {
                // User approved, execute the tool
                adaptedCallbacks.onToolOutput(`✅ Action approved by user. Executing...`);

                // Create a context object to pass to the tool
                const context = {
                  requiresApproval: true,
                  approvalReason: reason
                };

                // Execute the tool with the context
                result = await this.executeToolWithContextFallback(
                  toolName,
                  toolInput,
                  () => { budget.called(); return tool.func(toolInput, context); }
                );
              } else {
                // User rejected, skip execution
                result = "Action cancelled by user.";
                adaptedCallbacks.onToolOutput(`❌ Action rejected by user.`);
              }
            } catch (approvalError) {
              console.error(`Error in approval process:`, approvalError);
              result = "Error in approval process. Action cancelled.";
              adaptedCallbacks.onToolOutput(`❌ Error in approval process: ${approvalError}`);
            }
          } else {
            // No approval required, execute the tool normally
            result = await this.executeToolWithContextFallback(
              toolName,
              toolInput,
              () => { budget.called(); return tool.func(toolInput); }
            );
            console.log("tool func result: " ,result)
          }

          traceEvent.endedAt = Date.now();
          const decodedResult = decodeToolResult(result);
          const repairInstruction = [budget.record(toolName, toolInput, decodedResult), budget.guidance()].filter(Boolean).join('\n');
          traceEvent.result = decodedResult;
          adaptedCallbacks.onToolEvent?.(traceEvent);

          // Signal that tool execution is complete
          if (adaptedCallbacks.onToolEnd) {
            adaptedCallbacks.onToolEnd(result);
          }

          // Check for cancellation after tool execution
          if (this.errorHandler.isExecutionCancelled()) break;

          // Preserve the native protocol in history as an assistant/tool pair.
          const payload = decodedResult.data as { type?: string; id?: string; note?: string } | undefined;
          const feedback = decodedResult.ok && payload && typeof payload === 'object' && payload.type === 'screenshotRef' && payload.id
            ? `Screenshot captured (${payload.id}). ${payload.note || ''} Answer the original request: "${prompt}". ${repairInstruction}`
            : `${JSON.stringify(decodedResult)}\n${repairInstruction}`;
          if (nativeToolCall) {
            const id = nativeToolCall.id || `call-${traceEvent.executionId}`;
            messages.push({ ...assistantMessage(), content: accumulatedText || null, tool_calls: [{ id, type: 'function', function: { name: toolName, arguments: JSON.stringify({ input: toolInput, requires_approval: llmRequiresApproval }) } }] },
              { role: 'tool', tool_call_id: id, content: feedback });
          } else {
            messages.push(assistantMessage(), { role: 'user', content: `Tool result: ${feedback}` });
          }

          messages = this.llmProvider.toolCallFormat === 'native' ? trimNativeHistory(messages) : trimHistory(messages);
        } catch (error) {
          // If an error occurs during execution, check if it was due to cancellation
          if (this.errorHandler.isExecutionCancelled()) break;
          throw error; // Re-throw if it wasn't a cancellation
        }
      }

      if (this.errorHandler.isExecutionCancelled()) {
        adaptedCallbacks.onLlmOutput(
          `\n\nExecution cancelled by user.`
        );
        outcome = { status: 'cancelled', reason: 'CANCELLED' };
      }
      if (outcome.status === 'failed') adaptedCallbacks.onLlmOutput(outcome.message || outcome.reason);
      adaptedCallbacks.onExecutionOutcome?.(outcome);
      adaptedCallbacks.onExecutionEnd?.(outcome.status === 'blocked' ? 'failed' : outcome.status, outcome.status === 'completed' || outcome.status === 'cancelled' ? undefined : outcome.message || outcome.reason);
      adaptedCallbacks.onComplete();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      const cancelled = this.errorHandler.isExecutionCancelled();
      const outcome: ExecutionOutcome = cancelled
        ? { status: 'cancelled', reason: 'CANCELLED' }
        : { status: 'failed', reason: 'EXECUTION_ERROR', message };
      if (!cancelled) adaptedCallbacks.onLlmOutput(`Fatal error: ${message}`);
      adaptedCallbacks.onExecutionOutcome?.(outcome);
      adaptedCallbacks.onExecutionEnd?.(outcome.status === 'cancelled' ? 'cancelled' : 'failed', cancelled ? undefined : message);
      adaptedCallbacks.onComplete();
    } finally {
      this.executing = false;
    }
  }

  private parseToolInput(input: string): unknown {
    try { return JSON.parse(input); } catch { return input; }
  }

}
