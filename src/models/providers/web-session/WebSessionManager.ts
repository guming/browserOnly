import { ProviderTabRegistry, ProviderTab } from './providerTabRegistry';

export const CHATGPT_URL = 'https://chatgpt.com/';

export class WebSessionManager {
  constructor(private readonly registry = new ProviderTabRegistry()) {}

  async getOrCreate(windowId: number): Promise<ProviderTab> {
    const existing = this.registry.get(windowId);
    if (existing) {
      try { await chrome.tabs.get(existing.tabId); return existing; } catch { this.registry.remove(windowId, existing.tabId); }
    }
    const tab = await chrome.tabs.create({ windowId, url: CHATGPT_URL, active: false });
    if (tab.id === undefined) throw new Error('Unable to create ChatGPT Web session tab');
    const result = { windowId, tabId: tab.id, url: CHATGPT_URL };
    this.registry.set(result);
    return result;
  }

  onTabRemoved(tabId: number, windowId: number): void { this.registry.remove(windowId, tabId); }
  getRegistry(): ProviderTabRegistry { return this.registry; }
}
