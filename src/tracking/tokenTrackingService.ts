import { ConfigManager } from "../background/configManager";
import { anthropicModels, openaiModels, geminiModels, ollamaModels, deepseekModels } from "../models/models";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export class TokenTrackingService {
  private static instance: TokenTrackingService;

  // In-memory storage (no persistence)
  private inputTokens: number = 0;
  private outputTokens: number = 0;
  private cost: number = 0;

  // Provider and model tracking
  private configManager: ConfigManager;
  private currentProvider: string = 'anthropic';
  private currentModelId: string = '';

  // Subscribers for UI updates
  private subscribers: (() => void)[] = [];

  private constructor() {
    this.configManager = ConfigManager.getInstance();
    this.initializeProviderConfig();
  }

  public static getInstance(): TokenTrackingService {
    if (!TokenTrackingService.instance) {
      TokenTrackingService.instance = new TokenTrackingService();
    }
    return TokenTrackingService.instance;
  }

  private async initializeProviderConfig() {
    try {
      const config = await this.configManager.getProviderConfig();
      this.currentProvider = config.provider;
      this.currentModelId = config.apiModelId || '';
    } catch (error) {
      console.error('Failed to get provider config:', error);
    }
  }

  public trackInputTokens(tokens: number, cacheTokens?: { write?: number, read?: number }, windowId?: number): void {
    const cacheWriteTokens = cacheTokens?.write || 0;
    const cacheReadTokens = cacheTokens?.read || 0;
    const pricing = this.getCurrentPricing();

    this.inputTokens += tokens + cacheWriteTokens + cacheReadTokens;
    this.cost += (
      tokens * pricing.inputPrice +
      cacheWriteTokens * pricing.cacheWritesPrice +
      cacheReadTokens * pricing.cacheReadsPrice
    ) / 1_000_000;
    this.notifySubscribers(windowId);
  }

  public trackOutputTokens(tokens: number, windowId?: number): void {
    const pricing = this.getCurrentPricing();
    this.outputTokens += tokens;
    this.cost += (tokens * pricing.outputPrice) / 1_000_000;
    this.notifySubscribers(windowId);
  }

  public getUsage(): TokenUsage {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cost: this.cost
    };
  }

  public reset(windowId?: number): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.cost = 0;
    this.notifySubscribers(windowId);
  }

  public subscribe(callback: () => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  // Update provider and model information
  public updateProviderAndModel(provider: string, modelId: string, windowId?: number): void {
    this.currentProvider = provider;
    this.currentModelId = modelId;
    this.notifySubscribers(windowId);
  }

  private getCurrentPricing(): {
    inputPrice: number;
    outputPrice: number;
    cacheWritesPrice: number;
    cacheReadsPrice: number;
  } {
    let model: {
      inputPrice: number;
      outputPrice: number;
      cacheWritesPrice?: number;
      cacheReadsPrice?: number;
    } | undefined;

    switch (this.currentProvider) {
      case 'anthropic':
        if (this.currentModelId && this.currentModelId in anthropicModels) {
          model = anthropicModels[this.currentModelId as keyof typeof anthropicModels];
        }
        break;
      case 'openai':
        if (this.currentModelId && this.currentModelId in openaiModels) {
          model = openaiModels[this.currentModelId as keyof typeof openaiModels];
        }
        break;
      case 'deepseek':
        if (this.currentModelId && this.currentModelId in deepseekModels) {
          model = deepseekModels[this.currentModelId as keyof typeof deepseekModels];
        }
        break;
      case 'gemini':
        if (this.currentModelId && this.currentModelId in geminiModels) {
          model = geminiModels[this.currentModelId as keyof typeof geminiModels];
        }
        break;
      case 'ollama':
        if (this.currentModelId && this.currentModelId in ollamaModels) {
          model = ollamaModels[this.currentModelId as keyof typeof ollamaModels];
        }
        break;
    }

    const inputPrice = model?.inputPrice || 0;
    return {
      inputPrice,
      outputPrice: model?.outputPrice || 0,
      cacheWritesPrice: model?.cacheWritesPrice ?? inputPrice,
      cacheReadsPrice: model?.cacheReadsPrice ?? inputPrice,
    };
  }

  private notifySubscribers(windowId?: number): void {
    // Send message to UI via Chrome runtime messaging
    try {
      const usage = this.getUsage();

      // Get the current tab ID and window ID if possible
      chrome.tabs.query({ active: true, lastFocusedWindow: true })
        .then(tabs => {
          const tabId = tabs[0]?.id;
          const currentWindowId = tabs[0]?.windowId || windowId;

          chrome.runtime.sendMessage({
            action: 'tokenUsageUpdated',
            content: usage,
            tabId,
            windowId: currentWindowId
          });
        })
        .catch(error => {
          // If we can't get the current tab, just send the message without tab/window ID
          console.error('Error getting current tab:', error);
          chrome.runtime.sendMessage({
            action: 'tokenUsageUpdated',
            content: usage
          });
        });
    } catch (error) {
      console.error('Error sending token usage update:', error);
    }

    // Also notify local subscribers
    this.subscribers.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in subscriber callback:', error);
      }
    });
  }
}
