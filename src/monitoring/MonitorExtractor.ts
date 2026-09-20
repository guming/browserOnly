import type { StableLocator } from '../workflows/types';

export interface ExtractedMonitorValue { value: string; title: string; url: string; locatorUsed: string; found: boolean; authRequired: boolean; captchaDetected: boolean; }

export function locatorCandidates(locator: StableLocator): string[] {
  const candidates: string[] = [];
  for (const kind of locator.fallbackOrder) {
    const value = kind === 'role' && locator.role ? `[role="${locator.role}"]`
      : kind === 'label' && locator.label ? `[aria-label="${locator.label}"]`
      : kind === 'testId' && locator.testId ? `[data-testid="${locator.testId}"]`
      : kind === 'text' && locator.text ? `text:${locator.text}`
      : kind === 'css' && locator.css ? locator.css : '';
    if (value) candidates.push(value);
  }
  return candidates;
}

/** Runs inside the monitored page through chrome.scripting.executeScript. */
export function extractElementInPage(candidates: string[], allowMissing = false): ExtractedMonitorValue {
  const bodyText = document.body?.innerText ?? '';
  const authRequired = /\b(sign in|log in|登录|登陆)\b/i.test(bodyText.slice(0, 5000)) && /login|signin|auth/i.test(location.href);
  const captchaDetected = /captcha|verify you are human|人机验证|安全验证/i.test(bodyText.slice(0, 10000));
  for (const candidate of candidates) {
    let elements: Element[] = [];
    if (candidate.startsWith('text:')) {
      const wanted = candidate.slice(5);
      elements = [...document.querySelectorAll('body *')].filter(item => (item.textContent ?? '').trim() === wanted);
    } else {
      try { elements = [...document.querySelectorAll(candidate)]; } catch { continue; }
    }
    const visible = elements.filter(item => { const rect = item.getBoundingClientRect(); const style = getComputedStyle(item); return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; });
    if (visible.length === 1) {
      const element = visible[0] as HTMLElement;
      const value = 'value' in element ? String((element as HTMLInputElement).value) : (element.innerText || element.textContent || '');
      return { value, title: document.title, url: location.href, locatorUsed: candidate, found: true, authRequired, captchaDetected };
    }
    if (visible.length > 1) throw new Error('MULTIPLE_MATCHES');
  }
  if (authRequired) throw new Error('AUTH_REQUIRED');
  if (captchaDetected) throw new Error('CAPTCHA_DETECTED');
  if (allowMissing) return { value: '', title: document.title, url: location.href, locatorUsed: candidates[0] ?? '', found: false, authRequired, captchaDetected };
  throw new Error('LOCATOR_NOT_FOUND');
}

/** Runs inside the monitored page through chrome.scripting.executeScript. */
export function extractPageTextInPage(): ExtractedMonitorValue {
  const selectors = ['main', 'article', '[role="main"]', '#content', '#main', '.content', '.main-content', 'body'];
  let source: Element | null = null;
  for (const selector of selectors) { const candidate = document.querySelector(selector); if (candidate && (candidate.textContent ?? '').trim()) { source = candidate; break; } }
  if (!source) throw new Error('LOCATOR_NOT_FOUND');
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script,style,noscript,nav,footer,[aria-hidden="true"],[hidden]').forEach(node => node.remove());
  clone.querySelectorAll('*').forEach(node => { const element = node as HTMLElement; if (element.style.display === 'none' || element.style.visibility === 'hidden') element.remove(); });
  const value = (clone.innerText || clone.textContent || '').split('\n').map(line => line.trim()).filter(line => line && !/^(advertisement|广告)$/i.test(line) && !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(line)).join('\n').slice(0, 200_000);
  const bodyText = document.body?.innerText ?? '';
  return { value, title: document.title, url: location.href, locatorUsed: selectors.find(selector => document.querySelector(selector) === source) ?? 'body', found: true, authRequired: /login|signin|auth/i.test(location.href), captchaDetected: /captcha|verify you are human|人机验证|安全验证/i.test(bodyText.slice(0, 10000)) };
}
