import { captureScreenshot } from '../../../../src/agent/tools/captureScreenshot';
import { registerPageTab } from '../../../../src/agent/tools/pageTabIdentity';

describe('native extension screenshot adapter', () => {
  let send: jest.Mock;
  let id = 100;
  const pageForTab = () => {
    const page: any = { screenshot: jest.fn(), url: () => 'https://example.com/same-url' };
    registerPageTab(page, ++id);
    return { page, tabId: id };
  };
  beforeEach(() => {
    send = jest.fn().mockResolvedValue({ data: Buffer.from('image').toString('base64') });
    (chrome.debugger as any).sendCommand = send;
    (chrome.tabs.get as jest.Mock).mockResolvedValue({ status: 'complete' });
  });
  afterEach(() => jest.useRealTimers());
  it('uses page identity rather than the active tab or URL matching', async () => {
    const first = pageForTab(), second = pageForTab();
    const bytes = await captureScreenshot(second.page, { type: 'jpeg', quality: 40 });
    expect(bytes.toString()).toBe('image');
    expect(send).toHaveBeenCalledWith({ tabId: second.tabId }, 'Page.captureScreenshot', { format: 'jpeg', quality: 40 });
    expect(first.page.screenshot).not.toHaveBeenCalled();
    expect(second.page.screenshot).not.toHaveBeenCalled();
  });
  it('uses PNG without JPEG options and full-page CSS layout dimensions', async () => {
    const { page, tabId } = pageForTab();
    send.mockResolvedValueOnce({ cssContentSize: { width: 800, height: 2400 } })
      .mockResolvedValueOnce({ data: Buffer.from('png').toString('base64') });
    await captureScreenshot(page, { type: 'png', fullPage: true });
    expect(send).toHaveBeenNthCalledWith(1, { tabId }, 'Page.getLayoutMetrics', {});
    expect(send).toHaveBeenNthCalledWith(2, { tabId }, 'Page.captureScreenshot', {
      format: 'png', clip: { x: 0, y: 0, width: 800, height: 2400, scale: 1 }, captureBeyondViewport: true,
    });
  });
  it('rejects unknown identity, disconnected debugger, empty captures and oversized pages', async () => {
    await expect(captureScreenshot({} as any)).rejects.toThrow('SCREENSHOT_TARGET_UNKNOWN');
    const { page } = pageForTab();
    send.mockRejectedValueOnce(new Error('Debugger is not attached'));
    await expect(captureScreenshot(page)).rejects.toThrow('SCREENSHOT_DISCONNECTED');
    send.mockResolvedValueOnce({});
    await expect(captureScreenshot(page)).rejects.toThrow('SCREENSHOT_EMPTY');
    send.mockResolvedValueOnce({ cssContentSize: { width: 1000, height: 100000 } });
    await expect(captureScreenshot(page, { fullPage: true })).rejects.toThrow('SCREENSHOT_TOO_LARGE');
    expect(page.screenshot).not.toHaveBeenCalled();
  });
  it('bounds timeout and guards the tab until the underlying capture settles', async () => {
    jest.useFakeTimers();
    const { page } = pageForTab();
    let finish!: (value: any) => void;
    send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const result = expect(captureScreenshot(page, { timeout: 50 })).rejects.toThrow('SCREENSHOT_TIMEOUT');
    await jest.advanceTimersByTimeAsync(50);
    await result;
    await expect(captureScreenshot(page)).rejects.toThrow('SCREENSHOT_BUSY');
    expect(send).toHaveBeenCalledTimes(1);
    finish({ data: Buffer.from('late').toString('base64') });
    await Promise.resolve(); await Promise.resolve();
    await expect(captureScreenshot(page)).resolves.toBeDefined();
  });
  it('waits for Chrome tab readiness rather than capturing during target navigation', async () => {
    jest.useFakeTimers();
    const { page } = pageForTab();
    (chrome.tabs.get as jest.Mock).mockResolvedValueOnce({ status: 'loading' }).mockResolvedValue({ status: 'complete' });
    const promise = captureScreenshot(page, { timeout: 1000 });
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(100);
    await promise;
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not submit a capture command when navigation never settles', async () => {
    jest.useFakeTimers();
    const { page } = pageForTab();
    (chrome.tabs.get as jest.Mock).mockResolvedValue({ status: 'loading' });
    const result = expect(captureScreenshot(page, { timeout: 300 })).rejects.toThrow('SCREENSHOT_NOT_READY');
    await jest.advanceTimersByTimeAsync(300);
    await result;
    expect(send).not.toHaveBeenCalled();
  });
});
