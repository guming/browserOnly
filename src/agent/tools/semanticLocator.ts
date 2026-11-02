import { selectorCandidates } from "./selectorUtils";
import type { Page, Locator } from 'playwright-crx';

export interface SemanticTarget {
  text?: string;
  role?: string;
  name?: string;
  selector?: string;
  scope?: string;
  exact?: boolean;
}
export interface ClickVerification {
  target?: SemanticTarget;
  state: 'checked' | 'selected' | 'expanded' | 'visible';
  expected: boolean;
  timeoutMs?: number;
}
export class TargetError extends Error {
  constructor(public code: string, message: string, public candidates: unknown[] = [], public totalCount = 0) { super(message); }
}
const roles = new Set(['button', 'link', 'checkbox', 'radio', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'combobox', 'textbox', 'tab', 'switch', 'treeitem', 'listbox', 'menu', 'dialog', 'searchbox', 'heading']);
export function validateTarget(value: unknown): asserts value is SemanticTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TargetError('INVALID_ARGUMENT', 'Expected a target object');
  const target = value as SemanticTarget;
  for (const field of ['text', 'role', 'name', 'selector', 'scope'] as const) {
    if (target[field] !== undefined && (typeof target[field] !== 'string' || !target[field]!.trim() || target[field]!.length > 2000)) throw new TargetError('INVALID_ARGUMENT', `Invalid ${field}`);
  }
  if (target.exact !== undefined && typeof target.exact !== 'boolean') throw new TargetError('INVALID_ARGUMENT', 'exact must be boolean');
  if (Number(!!target.text) + Number(!!target.role) + Number(!!target.selector) !== 1 || target.name && !target.role || target.role && !roles.has(target.role)) throw new TargetError('INVALID_ARGUMENT', 'Specify exactly one of text, role, selector; name requires a supported role');
}
export function parseTarget(raw: string): SemanticTarget {
  if (!raw.trim()) throw new TargetError('INVALID_ARGUMENT', 'Target must not be empty');
  if (raw.trimStart().startsWith('{')) { const value = JSON.parse(raw); validateTarget(value); return value; }
  return /[#.\[]/.test(raw) ? { selector: raw.trim() } : { text: raw.trim() };
}

async function summaries(locator: Locator): Promise<unknown[]> {
  return locator.evaluateAll((nodes: Element[]) => nodes.slice(0, 5).map(node => {
    const parent = node.closest('[role="dialog"], [role="menu"], [role="listbox"], section, form');
    return {
      tag: node.tagName.toLowerCase(), role: node.getAttribute('role'),
      text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      name: node.getAttribute('aria-label')?.slice(0, 160),
      container: parent ? { role: parent.getAttribute('role'), name: parent.getAttribute('aria-label')?.slice(0, 160), id: parent.id.slice(0, 160) } : null,
      disabled: node.matches(':disabled') || !!node.closest('[aria-disabled="true"]'),
      checked: node.getAttribute('aria-checked'), selected: node.getAttribute('aria-selected'), expanded: node.getAttribute('aria-expanded'),
    };
  }));
}
async function unique(locator: Locator, scope = false): Promise<Locator> {
  const count = await locator.count();
  if (count !== 1) throw new TargetError(count ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND', scope ? 'Scope must match one visible container' : 'Target must match one visible element; refine scope or target', count ? await summaries(locator) : [], count);
  return locator;
}
export async function resolveTarget(page: Page, target: SemanticTarget, actionable = false): Promise<Locator> {
  validateTarget(target);
  const select = async (locator: Locator) => {
    if (actionable && await locator.count() > 1) {
      locator = locator.and(page.locator(':not(:disabled):not([aria-disabled="true"]):not([aria-disabled="true"] *)'));
      if (!await locator.count()) throw new TargetError('TARGET_DISABLED', 'All matching targets are disabled');
    }
    return unique(locator);
  };
  let root: Page | Locator = page;
  if (target.scope) root = await unique(page.locator(target.scope).and(page.locator(':visible')), true);
  if (target.selector) {
    for (const candidate of selectorCandidates(target.selector)) {
      const locator = root.locator(candidate).and(page.locator(':visible'));
      if (await locator.count()) return select(locator);
    }
    throw new TargetError('TARGET_NOT_FOUND', 'No visible target matched the selector');
  }
  let locator = target.selector ? root.locator(target.selector) : target.role
    ? root.getByRole(target.role as any, { ...(target.name ? { name: target.name } : {}), exact: target.exact ?? true })
    : root.getByText(target.text!, { exact: target.exact ?? true });
  locator = locator.and(page.locator(':visible'));
  return select(locator);
}
export async function readTargetState(locator: Locator): Promise<Record<string, unknown>> {
  return locator.evaluate((node: Element) => {
    const native = node as HTMLInputElement;
    const bool = (name: string) => node.getAttribute(name) === 'true' ? true : node.getAttribute(name) === 'false' ? false : null;
    return {
      text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      role: node.getAttribute('role'), name: node.getAttribute('aria-label')?.slice(0, 160),
      checked: node.matches('input[type="checkbox"],input[type="radio"]') ? native.checked : bool('aria-checked'),
      selected: node.matches('option') ? (node as HTMLOptionElement).selected : bool('aria-selected'),
      expanded: bool('aria-expanded'), disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true',
      visible: !!(node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden'),
    };
  });
}
export function targetFailure(error: unknown, dispatched = false): string {
  const known = error instanceof TargetError;
  return JSON.stringify({ ok: false, data: { dispatched }, error: { code: dispatched ? known ? 'VERIFICATION_UNKNOWN' : 'ACTION_UNCERTAIN' : known ? error.code : 'PAGE_UNAVAILABLE', message: error instanceof Error ? error.message : String(error), repairable: !dispatched && known }, meta: known ? { totalCount: error.totalCount, candidates: error.candidates, truncated: error.totalCount > 5 } : undefined });
}
