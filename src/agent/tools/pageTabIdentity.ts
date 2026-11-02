import type { Page } from 'playwright-crx';

const tabs = new WeakMap<object, number>();
export function registerPageTab(page: Page, tabId: number): void { tabs.set(page, tabId); }
export function getTabIdForPage(page: Page): number | undefined { return tabs.get(page); }
