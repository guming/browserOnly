import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OllamaProvider, OllamaProviderOptions } from './ollama';
import { OpenAIProvider } from './openai';
import { OpenAICompatibleProvider, OpenAICompatibleProviderOptions } from './openai-compatible';
import { LLMProvider, ProviderOptions } from './types';
import { DeepSeekProvider } from './deepseek';

export async function createProvider(
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'openai-compatible' | 'deepseek',
  options: ProviderOptions | OpenAICompatibleProviderOptions
): Promise<LLMProvider> {
  console.log("options",options)
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(options);
    case 'openai':
      return new OpenAIProvider(options);
    case 'gemini':
      return new GeminiProvider(options);
      case 'ollama':
        {
          // Get custom Ollama models from storage
          const ollamaCustomModels = await chrome.storage.sync.get({ ollamaCustomModels: [] });
          return new OllamaProvider({
            ...options,
            ollamaCustomModels: ollamaCustomModels.ollamaCustomModels || []
          } as OllamaProviderOptions);
        }
    case 'openai-compatible':
      return new OpenAICompatibleProvider(options as OpenAICompatibleProviderOptions);
    case 'deepseek':
      return new DeepSeekProvider(options);
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
}
