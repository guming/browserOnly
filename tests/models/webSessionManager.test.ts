import { ProviderTabRegistry } from '../../src/models/providers/web-session/providerTabRegistry';
import { WebSessionManager } from '../../src/models/providers/web-session/WebSessionManager';

describe('WebSessionManager', () => {
  beforeEach(() => { (globalThis as any).chrome = { tabs: { get: jest.fn().mockResolvedValue({ id: 7 }), create: jest.fn().mockResolvedValue({ id: 9 }) } }; });
  it('isolates sessions by window and reuses an existing tab', async () => {
    const manager = new WebSessionManager(new ProviderTabRegistry());
    const first = await manager.getOrCreate(1);
    const again = await manager.getOrCreate(1);
    expect(first.tabId).toBe(9); expect(again.tabId).toBe(9); expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  });
  it('recreates a tab after it was closed', async () => {
    const get = jest.fn().mockRejectedValue(new Error('closed'));
    (chrome.tabs.get as jest.Mock) = get;
    const manager = new WebSessionManager(new ProviderTabRegistry());
    await manager.getOrCreate(1); await manager.getOrCreate(1);
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
  });
});
