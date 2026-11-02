import { Buffer } from 'buffer';
import type { Page } from 'playwright-crx';
import { getTabIdForPage } from './pageTabIdentity';

const pending = new Set<number>();
export function screenshotFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.match(/^SCREENSHOT_[A-Z_]+/)?.[0] || 'SCREENSHOT_FAILED';
  return JSON.stringify({ ok: false, error: { code, message, repairable: code === 'SCREENSHOT_NOT_READY' || code === 'SCREENSHOT_EMPTY' } });
}
async function bounded<T>(operation: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('SCREENSHOT_TIMEOUT: capture did not complete within budget')), timeout);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Extension screenshots bypass the Playwright queue and target only ready tabs. */
export async function captureScreenshot(page: Page, options: { type?: 'png' | 'jpeg'; quality?: number; fullPage?: boolean; timeout?: number } = {}): Promise<Buffer> {
  const timeout = options.timeout ?? 5000;
  const tabId = getTabIdForPage(page);
  if (tabId === undefined) {
    // Non-extension callers retain Playwright behavior; never guess another tab.
    if (typeof chrome !== 'undefined' && typeof chrome.debugger?.sendCommand === 'function') throw new Error('SCREENSHOT_TARGET_UNKNOWN: page has no registered tab identity');
    return page.screenshot({ ...options, timeout }) as Promise<Buffer>;
  }
  if (pending.has(tabId)) throw new Error('SCREENSHOT_BUSY: previous capture is still pending for this tab');
  pending.add(tabId);
  const deadline = performance.now() + timeout;
  const operation = (async () => {
    // document.readyState can be complete while Chrome is still navigating
    // subtargets. Capturing during that hand-off can leave CDP pending forever.
    let tab = await chrome.tabs.get(tabId);
    while (tab.status === 'loading') {
      const remaining = deadline - performance.now();
      if (remaining <= 100) throw new Error('SCREENSHOT_NOT_READY: tab is still navigating; inspect or retry after navigation completes');
      await new Promise(resolve => setTimeout(resolve, Math.min(100, remaining)));
      tab = await chrome.tabs.get(tabId);
    }
    let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;
    if (options.fullPage) {
      const metrics = await chrome.debugger.sendCommand({ tabId }, 'Page.getLayoutMetrics', {}) as { cssContentSize?: { width: number; height: number } };
      const size = metrics.cssContentSize;
      if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) throw new Error('SCREENSHOT_LAYOUT_INVALID: page content dimensions unavailable');
      if (size.width > 32767 || size.height > 32767 || size.width * size.height > 64_000_000) throw new Error('SCREENSHOT_TOO_LARGE: use a viewport capture instead');
      clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 };
    }
    if (performance.now() >= deadline) throw new Error('SCREENSHOT_TIMEOUT: capture budget exhausted before capture');
    const result = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
      format: options.type || 'jpeg', ...(options.type === 'png' ? {} : { quality: options.quality ?? 40 }),
      ...(clip ? { clip, captureBeyondViewport: true } : {}),
    }) as { data?: string };
    if (!result?.data) throw new Error('SCREENSHOT_EMPTY: browser returned no image');
    return Buffer.from(result.data, 'base64');
  })();
  // A timeout does not cancel CDP. Keep the tab guarded until it actually settles.
  void operation.then(() => pending.delete(tabId), () => pending.delete(tabId));
  try { return await bounded(operation, timeout); }
  catch (error) {
    if (/not attached|cannot access.*target|no target with given id/i.test(String(error))) throw new Error('SCREENSHOT_DISCONNECTED: browser debugger connection was lost');
    throw error;
  }
}
