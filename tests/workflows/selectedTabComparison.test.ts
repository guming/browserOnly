jest.mock('../../src/background/configManager', () => ({ ConfigManager: { getInstance: jest.fn(() => ({ getProviderConfig: jest.fn().mockResolvedValue({ provider: 'ollama', apiKey: '' }) })) } }));
jest.mock('../../src/models/providers/factory', () => ({ createProvider: jest.fn() }));
import { createProvider } from '../../src/models/providers/factory';
import { compareSelectedTabs } from '../../src/workflows/selectedTabComparison';

describe('compareSelectedTabs', () => {
  beforeEach(() => {
    (chrome.tabs.get as jest.Mock).mockImplementation(async (id: number) => ({ id, windowId: 1, url: `https://example.com/${id}`, title: `Page ${id}` }));
    (chrome.scripting.executeScript as jest.Mock).mockResolvedValue([{ result: 'Visible source text' }]);
    (createProvider as jest.Mock).mockResolvedValue({ createMessage: async function* () { yield { type: 'text', text: 'Compared sources.' }; } });
  });

  it('reads exactly the chosen tabs before comparing', async () => {
    await expect(compareSelectedTabs({ tabs: [10, 11], mode: 'compare' }, 1)).resolves.toBe('Compared sources.');
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2);
    expect((chrome.scripting.executeScript as jest.Mock).mock.calls.map(call => call[0].target.tabId)).toEqual([10, 11]);
  });

  it('rejects a tab from another window', async () => {
    (chrome.tabs.get as jest.Mock).mockResolvedValueOnce({ id: 10, windowId: 2, url: 'https://example.com/10' });
    await expect(compareSelectedTabs({ tabs: [10, 11] }, 1)).rejects.toThrow('current window');
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });
});
