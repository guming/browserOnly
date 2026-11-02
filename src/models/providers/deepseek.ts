import { canonicalDeepSeekModelId, deepseekDefaultModelId, deepseekModels } from '../models';
import { ApiStream, LLMProvider, ModelInfo, ProviderOptions, NativeToolCall } from './types';
import OpenAI from 'openai';

/** Native tool transport. XML is supported only by legacy providers in the engine. */
export class DeepSeekProvider implements LLMProvider {
  readonly toolCallFormat = 'native' as const;
  private client: OpenAI;
  constructor(private options: ProviderOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseUrl });
  }
  static getAvailableModels(): { id: string; name: string }[] {
    return Object.entries(deepseekModels).map(([id, info]) => ({ id, name: info.name }));
  }
  async *createMessage(systemPrompt: string, messages: any[], tools?: any[]): ApiStream {
    const model = this.getModel();
    const nativeInstructions = 'Use native function calls for tool execution. Emit exactly one call at a time with input (string, empty string if no arguments) and requires_approval (boolean). Never write XML tool invocations in assistant text. Set approval true for purchases, deletion, externally visible messages, sensitive forms or risky actions; if uncertain choose true.';
    const prompt = tools?.length ? systemPrompt
      .replace(/## TOOL-CALL SYNTAX[\s\S]*?(?=\n\s*Note:|$)/, `## TOOL-CALL SYNTAX\n${nativeInstructions}\n`)
      .replace(/<tool>([^<]+)<\/tool>/g, '$1') + `\n${nativeInstructions}\nCompletion declarations remain assistant text and contain the full requested answer.` : systemPrompt;
    const options: any = {
      model: model.id,
      messages: [{ role: 'system', content: prompt }, ...messages.filter(message => !(message.role === 'user' && typeof message.content === 'string' && message.content.startsWith('[SYSTEM INSTRUCTION:'))).map(message => ({ role: message.role, content: message.content, ...(message.role === 'assistant' && typeof message.reasoning_content === 'string' ? { reasoning_content: message.reasoning_content } : {}), ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}), ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}) }))],
      stream: true, stream_options: { include_usage: true }, max_tokens: model.info.maxTokens || 4096, temperature: 0,
    };
    if (this.options.thinkingBudgetTokens && model.info.supportsPromptCache) {
      options.thinking = { type: 'enabled' };
      options.temperature = undefined;
    }
    if (tools?.length) {
      options.tools = tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: {
        type: 'object', properties: { input: { type: 'string', description: 'The input to the tool' }, requires_approval: { type: 'boolean', description: 'Whether this action requires user approval' } }, required: ['input', 'requires_approval'],
      } } }));
      options.tool_choice = 'auto';
    }
    const stream = await this.client.chat.completions.create(options) as unknown as AsyncIterable<any>;
    let selectedIndex: number | undefined;
    let name = '';
    let id = 'call-0';
    let args = '';
    let emitted = false;
    const parse = (): NativeToolCall => {
      const parsed = JSON.parse(args);
      if (!name || !parsed || typeof parsed.input !== 'string' || typeof parsed.requires_approval !== 'boolean') throw new Error('Native tool arguments require input:string and requires_approval:boolean');
      return { id, name, input: parsed.input, requiresApproval: parsed.requires_approval };
    };
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) yield { type: 'text', text: delta.content };
      if (delta?.reasoning_content) yield { type: 'reasoning', reasoning: delta.reasoning_content };
      for (const call of delta?.tool_calls || []) {
        if (selectedIndex === undefined && call.function?.name) { selectedIndex = call.index ?? 0; name = call.function.name; id = call.id || `call-${selectedIndex}`; }
        if (!emitted && selectedIndex !== undefined && (call.index ?? 0) === selectedIndex) args += call.function?.arguments || '';
      }
      if (choice?.finish_reason === 'tool_calls' && selectedIndex !== undefined && !emitted) {
        emitted = true;
        try { yield { type: 'tool_call', toolCall: parse() }; }
        catch { yield { type: 'text', text: 'Error: Failed to parse tool call. Please try again.' }; }
      }
      if (chunk.usage) {
        const usage = chunk.usage;
        const cached = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;
        yield { type: 'usage', inputTokens: Math.max(0, (usage.prompt_tokens || 0) - cached), cacheReadTokens: cached, outputTokens: usage.completion_tokens || 0 };
      }
    }
    // Some compatible gateways omit the finish marker. Only valid complete JSON
    // may become an invocation; never guess or repair selector quoting.
    if (selectedIndex !== undefined && !emitted) {
      try { yield { type: 'tool_call', toolCall: parse() }; }
      catch { yield { type: 'text', text: 'Error: Failed to parse tool call. Please try again.' }; }
    }
  }
  getModel(): { id: string; info: ModelInfo } {
    const id = canonicalDeepSeekModelId(this.options.apiModelId || deepseekDefaultModelId);
    return { id, info: deepseekModels[id] };
  }
}
