import type { ApiStream, LLMProvider, ModelInfo, StreamChunk } from './types';
import { WebSessionManager } from './web-session/WebSessionManager';
import type { WebSessionStatus } from './web-session/types';

export interface ChatGPTWebProviderOptions { windowId: number; modelId?: string; session?: WebSessionManager; }

export class ChatGPTWebProvider implements LLMProvider {
  private readonly model: { id: string; info: ModelInfo };
  private readonly sessions: WebSessionManager;
  private status: WebSessionStatus = { provider: 'chatgpt-web', state: 'checking', checkedAt: Date.now() };
  constructor(private readonly options: ChatGPTWebProviderOptions) {
    this.sessions = options.session ?? new WebSessionManager();
    this.model = { id: options.modelId ?? 'chatgpt-web', info: { name: options.modelId ?? 'ChatGPT Web', inputPrice: 0, outputPrice: 0 } };
  }
  getModel(): { id: string; info: ModelInfo } { return this.model; }
  getStatus(): WebSessionStatus { return this.status; }
  async checkConnection(): Promise<WebSessionStatus> {
    try {
      const tab = await this.sessions.getOrCreate(this.options.windowId);
      const response = await chrome.tabs.sendMessage(tab.tabId, { action: 'chatgptWebStatus' });
      const state = response?.loggedIn ? 'connected' : 'login_required';
      this.status = { provider: 'chatgpt-web', state, tabId: tab.tabId, checkedAt: Date.now() };
    } catch (error) {
      this.status = { provider: 'chatgpt-web', state: 'unavailable', checkedAt: Date.now(), message: error instanceof Error ? error.message : String(error) };
    }
    return this.status;
  }
  async *createMessage(systemPrompt: string, messages: any[]): ApiStream {
    const status = await this.checkConnection();
    if (status.state !== 'connected' || status.tabId === undefined) throw new Error(`ChatGPT Web unavailable: ${status.state}`);
    const response = await chrome.tabs.sendMessage(status.tabId, { action: 'chatgptWebPrompt', systemPrompt, messages, modelId: this.model.id });
    if (response?.state === 'rate_limited' || response?.state === 'verification_required' || response?.state === 'page_changed') throw new Error(`ChatGPT Web unavailable: ${response.state}`);
    const chunk: StreamChunk = { type: 'text', text: String(response?.text ?? '') };
    yield chunk;
  }
}
