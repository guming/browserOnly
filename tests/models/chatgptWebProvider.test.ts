import { ChatGPTWebProvider } from '../../src/models/providers/chatgpt-web';

describe('ChatGPTWebProvider', () => {
  it('reports login required without exposing credentials', async () => {
    const session = { getOrCreate: jest.fn().mockResolvedValue({ tabId: 3 }) } as any;
    (globalThis as any).chrome = { tabs: { sendMessage: jest.fn().mockResolvedValue({ loggedIn: false }) } };
    const provider = new ChatGPTWebProvider({ windowId: 1, session });
    await expect(provider.createMessage('', []) .next()).rejects.toThrow('login_required');
    expect(provider.getStatus().state).toBe('login_required');
  });
});
