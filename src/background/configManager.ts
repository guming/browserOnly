import { AnthropicProvider } from '../models/providers/anthropic';
import { DeepSeekProvider } from '../models/providers/deepseek';
import { GeminiProvider } from '../models/providers/gemini';
import { DEFAULT_OLLAMA_BASE_URL, OllamaProvider, OllamaProviderOptions, OllamaModelConfig } from '../models/providers/ollama';
import { OpenAIProvider } from '../models/providers/openai';
import { OpenAICompatibleProvider } from '../models/providers/openai-compatible';

export interface ProviderConfig {
  provider: 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'openai-compatible' | 'deepseek';
  /** Provider used by translation features. 'primary' follows the main provider. */
  translationProvider?: 'primary' | 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'openai-compatible' | 'deepseek';
  apiKey: string;
  apiModelId?: string;
  baseUrl?: string;
  thinkingBudgetTokens?: number;
  // openai-compatible only
  openaiCompatibleModels?: Array<{ id: string; name: string; isReasoningModel?: boolean }>;
  ollamaCustomModels?: OllamaModelConfig[];
  connectionEndpoint?: string;
  connectionKey?: string;
}

export interface NotionConfig {
  enabled: boolean;
  bearerToken: string;
}

export class ConfigManager {
  private static instance: ConfigManager;
  
  private constructor() {}
  
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
  
  async getProviderConfig(): Promise<ProviderConfig> {
    const result = await chrome.storage.sync.get({
      provider: 'anthropic',
      translationProvider: 'primary',
      anthropicApiKey: '',
      anthropicModelId: 'claude-3-7-sonnet-20250219',
      anthropicBaseUrl: '',
      openaiApiKey: '',
      openaiModelId: 'gpt-4o',
      openaiBaseUrl: '',
      geminiApiKey: '',
      geminiModelId: 'gemini-1.5-pro',
      geminiBaseUrl: '',
      ollamaApiKey: '',
      ollamaModelId: '',
      ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
      ollamaCustomModels: [],
      deepseekApiKey: '',
      deepseekModelId: 'deepseek-chat',
      deepseekBaseUrl: '',
      thinkingBudgetTokens: 0,
      // openai-compatible
      openaiCompatibleApiKey: '',
      openaiCompatibleModelId: '',
      openaiCompatibleBaseUrl: '',
      openaiCompatibleModels: [],
    });

    const translationProvider = result.translationProvider || 'primary';
    
    // Return provider-specific configuration
    switch (result.provider) {
      case 'anthropic':
        return {
          provider: 'anthropic',
          translationProvider,
          apiKey: result.anthropicApiKey,
          apiModelId: result.anthropicModelId,
          baseUrl: result.anthropicBaseUrl,
          thinkingBudgetTokens: result.thinkingBudgetTokens,
        };
      case 'openai':
        return {
          provider: 'openai',
          translationProvider,
          apiKey: result.openaiApiKey,
          apiModelId: result.openaiModelId,
          baseUrl: result.openaiBaseUrl,
        };
      case 'gemini':
        return {
          provider: 'gemini',
          translationProvider,
          apiKey: result.geminiApiKey,
          apiModelId: result.geminiModelId,
          baseUrl: result.geminiBaseUrl,
        };
      case 'ollama':
        return {
          provider: 'ollama',
          translationProvider,
          apiKey: result.ollamaApiKey,
          apiModelId: result.ollamaModelId,
          baseUrl: result.ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL,
          ollamaCustomModels: result.ollamaCustomModels || [],
        };
      case 'deepseek':
        return {
          provider: 'deepseek',
          translationProvider,
          apiKey: result.deepseekApiKey,
          apiModelId: result.deepseekModelId,
          baseUrl: result.deepseekBaseUrl,
        };
      case 'openai-compatible':
        return {
          provider: 'openai-compatible',
          translationProvider,
          apiKey: result.openaiCompatibleApiKey,
          apiModelId: result.openaiCompatibleModelId,
          baseUrl: result.openaiCompatibleBaseUrl,
          openaiCompatibleModels: result.openaiCompatibleModels || [],
        };
      default:
        throw new Error(`Provider ${result.provider} not supported`);
    }
  }
  
  async saveProviderConfig(config: Partial<ProviderConfig>): Promise<void> {
    // Save provider-specific configuration
    await chrome.storage.sync.set(config);
  }
  
  /**
   * Get all providers that have API keys configured
   */
  async getConfiguredProviders(): Promise<string[]> {
    const result = await chrome.storage.sync.get({
      anthropicApiKey: '',
      openaiApiKey: '',
      geminiApiKey: '',
      ollamaApiKey: '',
      deepseekApiKey: '',
      openaiCompatibleApiKey: '',
      openaiCompatibleModels: [],
    });
    
    const providers = [];
    if (result.anthropicApiKey) providers.push('anthropic');
    if (result.openaiApiKey) providers.push('openai');
    if (result.geminiApiKey) providers.push('gemini');
    if (result.deepseekApiKey) providers.push('deepseek');
    
    // For Ollama, check if the base URL is configured AND at least one model exists
    const ollamaBaseUrl = (await this.getOllamaBaseUrl()) || DEFAULT_OLLAMA_BASE_URL;
    const ollamaResult = await chrome.storage.sync.get({ ollamaCustomModels: [] });
    const ollamaModels = ollamaResult.ollamaCustomModels || [];
    if (ollamaBaseUrl && ollamaModels.length > 0) {
      providers.push('ollama');
    }
    
    if (result.openaiCompatibleApiKey && (result.openaiCompatibleModels?.length > 0)) providers.push('openai-compatible');
    
    return providers;
  }
  
  /**
   * Get available models for a specific provider
   */
  async getModelsForProvider(provider: string): Promise<{id: string, name: string}[]> {
    switch (provider) {
      case 'anthropic':
        return AnthropicProvider.getAvailableModels();
      case 'openai':
        return OpenAIProvider.getAvailableModels();
      case 'gemini':
        return GeminiProvider.getAvailableModels();
      case 'ollama': {
        const result = await chrome.storage.sync.get({ ollamaCustomModels: [] });
        const models = OllamaProvider.getAvailableModels({ ollamaCustomModels: result.ollamaCustomModels } as OllamaProviderOptions);
        return models;
      }
      case 'deepseek':
        return DeepSeekProvider.getAvailableModels();
      case 'openai-compatible': {
        const result = await chrome.storage.sync.get({ openaiCompatibleModels: [] });
        return OpenAICompatibleProvider.getAvailableModels({ openaiCompatibleModels: result.openaiCompatibleModels || [] } as any);
      }
      default:
        return [];
    }
  }
  
  /**
   * Get the Ollama base URL from storage
   */
  async getOllamaBaseUrl(): Promise<string> {
    const result = await chrome.storage.sync.get({
      ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
    });
    return result.ollamaBaseUrl;
  }
  
  async updateProviderAndModel(provider: string, modelId: string): Promise<void> {
    // Get current config
    
    // Update provider
    await chrome.storage.sync.set({ provider });
    
    // Update model ID for the specific provider
    switch (provider) {
      case 'anthropic':
        await chrome.storage.sync.set({ anthropicModelId: modelId });
        break;
      case 'openai':
        await chrome.storage.sync.set({ openaiModelId: modelId });
        break;
      case 'gemini':
        await chrome.storage.sync.set({ geminiModelId: modelId });
        break;
      case 'ollama':
        await chrome.storage.sync.set({ ollamaModelId: modelId });
        break;
      case 'deepseek':
        await chrome.storage.sync.set({ deepseekModelId: modelId });
        break;
    }
  }

  /**
   * Get Notion configuration
   */
  async getNotionConfig(): Promise<NotionConfig> {
    const result = await chrome.storage.sync.get({
      notionEnabled: false,
      notionBearerToken: '',
    });

    return {
      enabled: result.notionEnabled,
      bearerToken: result.notionBearerToken,
    };
  }

  /**
   * Save Notion configuration
   */
  async saveNotionConfig(config: Partial<NotionConfig>): Promise<void> {
    const storageData: Record<string, any> = {};

    if (config.enabled !== undefined) {
      storageData.notionEnabled = config.enabled;
    }
    if (config.bearerToken !== undefined) {
      storageData.notionBearerToken = config.bearerToken;
    }

    await chrome.storage.sync.set(storageData);
  }

  /**
   * Check if Notion is configured and enabled
   */
  async isNotionEnabled(): Promise<boolean> {
    const config = await this.getNotionConfig();
    return config.enabled && config.bearerToken !== '';
  }
}
