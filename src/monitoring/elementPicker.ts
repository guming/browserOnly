import { buildStableLocatorFromElement } from '../workflows/locator';
import type { ElementSelection } from './types';

export interface RawElementSelection {
  sample: string; tagName: string; role?: string; accessibleName?: string;
  label?: string; testId?: string; id?: string; text?: string; css?: string; prohibited?: boolean;
}

export function toElementSelection(raw: RawElementSelection): ElementSelection {
  if (raw.prohibited) throw new Error('Password, payment, and one-time-code fields cannot be monitored');
  const locator = buildStableLocatorFromElement(raw);
  if (!locator) throw new Error('Unable to build a stable locator for this element');
  return { locator, sample: raw.sample, tagName: raw.tagName, label: raw.label };
}

/** Runs inside the target page through chrome.scripting.executeScript. */
export function installElementPicker(): Promise<RawElementSelection | null> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #315a78;background:rgba(49,90,120,.12);border-radius:3px;display:none';
    document.documentElement.appendChild(overlay);
    const move = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null; if (!target || target === overlay) return;
      const rect = target.getBoundingClientRect();
      Object.assign(overlay.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    };
    const cleanup = () => { document.removeEventListener('mousemove', move, true); document.removeEventListener('click', pick, true); document.removeEventListener('keydown', key, true); overlay.remove(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); cleanup(); resolve(null); } };
    const pick = (event: MouseEvent) => {
      event.preventDefault(); event.stopImmediatePropagation();
      const element = event.target as HTMLElement;
      const input = element as HTMLInputElement;
      const autocomplete = input.autocomplete?.toLowerCase() ?? '';
      const prohibited = input.type === 'password' || /cc-|one-time-code/.test(autocomplete);
      const label = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim() : undefined;
      const text = (element.innerText || input.value || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20000);
      const css = element.id ? `#${CSS.escape(element.id)}` : `${element.tagName.toLowerCase()}${element.classList.length ? `.${[...element.classList].slice(0, 2).map(item => CSS.escape(item)).join('.')}` : ''}`;
      const result: RawElementSelection = { sample: text, tagName: element.tagName.toLowerCase(), role: element.getAttribute('role') ?? undefined, accessibleName: element.getAttribute('aria-label') ?? label, label, testId: element.dataset.testid, id: element.id || undefined, text: text.slice(0, 120), css, prohibited };
      cleanup(); resolve(result);
    };
    document.addEventListener('mousemove', move, true); document.addEventListener('click', pick, true); document.addEventListener('keydown', key, true);
  });
}

