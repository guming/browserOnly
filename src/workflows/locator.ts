import type { StableLocator } from './types';

export interface ElementLocatorMetadata {
  role?: string; accessibleName?: string; label?: string; testId?: string;
  id?: string; text?: string; css?: string;
}

export function buildStableLocatorFromElement(metadata: ElementLocatorMetadata): StableLocator | undefined {
  const locator: StableLocator = { fallbackOrder: [] };
  if (metadata.role) { locator.role = metadata.role; locator.accessibleName = metadata.accessibleName; locator.fallbackOrder.push('role'); }
  if (metadata.label) { locator.label = metadata.label; locator.fallbackOrder.push('label'); }
  if (metadata.testId) { locator.testId = metadata.testId; locator.fallbackOrder.push('testId'); }
  if (metadata.text && metadata.text.length <= 120) { locator.text = metadata.text; locator.fallbackOrder.push('text'); }
  locator.css = metadata.id ? `#${cssEscape(metadata.id)}` : metadata.css;
  if (locator.css) locator.fallbackOrder.push('css');
  return locator.fallbackOrder.length ? locator : undefined;
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
}

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
