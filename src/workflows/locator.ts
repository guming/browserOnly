import type { StableLocator } from './types';

/** Converts common BrowserOnly selector inputs into an ordered, resilient locator. */
export function buildStableLocator(input: unknown): StableLocator | undefined {
  if (typeof input !== 'string' || !input.trim()) return undefined;
  const selector = input.trim();
  const locator: StableLocator = { fallbackOrder: [] };
  const role = selector.match(/^role=([^:]+)(?::name=(.*))?$/i);
  if (role) { locator.role = role[1]; if (role[2]) locator.accessibleName = role[2]; locator.fallbackOrder.push('role'); return locator; }
  const label = selector.match(/^(?:label=|aria-label=)(.+)$/i);
  if (label) { locator.label = label[1]; locator.fallbackOrder.push('label'); return locator; }
  const testId = selector.match(/^(?:testid=|\[data-testid=["']?)([^\]"']+)/i);
  if (testId) { locator.testId = testId[1]; locator.fallbackOrder.push('testId'); }
  const text = selector.match(/^text[=:](.+)$/i);
  if (text) { locator.text = text[1].replace(/^['"]|['"]$/g, ''); locator.fallbackOrder.push('text'); }
  locator.css = selector;
  locator.fallbackOrder.push('css');
  return locator;
}
