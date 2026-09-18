export interface ProviderTab { windowId: number; tabId: number; url: string; }

export class ProviderTabRegistry {
  private tabs = new Map<number, ProviderTab>();
  set(tab: ProviderTab): void { this.tabs.set(tab.windowId, tab); }
  get(windowId: number): ProviderTab | undefined { return this.tabs.get(windowId); }
  remove(windowId: number, tabId?: number): void {
    const current = this.tabs.get(windowId);
    if (current && (tabId === undefined || current.tabId === tabId)) this.tabs.delete(windowId);
  }
  clear(): void { this.tabs.clear(); }
}
