import {
  getTranslationRetryDelay,
  resetStateForNewTranslationSession,
  TranslationUnitState,
} from '../translation/orderedTranslationBuffer';
import { getSelectionOverlayPosition } from '../translation/selectionOverlayPosition';

type Mode = 'bilingual' | 'translation-only' | 'original';

interface Unit {
  sourceId: string;
  element: HTMLElement;
  text: string;
  translation?: string;
  state: TranslationUnitState;
  retryCount: number;
  retryTimer?: ReturnType<typeof setTimeout>;
  originalDisplay: string;
}

const TOOLBAR_HOST_ID = 'browseronly-selection-toolbar-host';
const RESULT_HOST_ID = 'browseronly-selection-result-host';
const VIEWPORT_GAP = 8;

let session = '';
let mode: Mode = 'bilingual';
let targetLanguage = navigator.language || 'zh-CN';
const units = new Map<string, Unit>();
let observer: MutationObserver | undefined;
let viewportObserver: IntersectionObserver | undefined;
let titleOriginal = '';
let selectionAnchor: DOMRect | undefined;

const PAGE_TRANSLATION_INJECTED_KEY = '__BROWSERONLY_PAGE_TRANSLATION_INJECTED__';
const shouldInitialize = !(globalThis as any)[PAGE_TRANSLATION_INJECTED_KEY];
if (shouldInitialize) (globalThis as any)[PAGE_TRANSLATION_INJECTED_KEY] = true;

const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function root(): HTMLElement {
  for (const selector of ['main', 'article', '[role="main"]', '#content', '#main', '.content', '.main-content']) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) return element;
  }
  return document.body;
}

function collect(): HTMLElement[] {
  const elements = Array.from(root().querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,li,blockquote,td'));
  return elements.filter((element) => {
    if (element.closest('.browseronly-translation,[data-browseronly-skip]')) return false;
    if (!element.textContent?.trim()) return false;
    if (element.closest('pre,code,script,style,textarea,input,select,button,form,[contenteditable="true"]')) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function viewportPriority(unit: Unit): number {
  const rect = unit.element.getBoundingClientRect();
  if (rect.bottom >= -600 && rect.top <= window.innerHeight + 600) return 0;
  return rect.top > window.innerHeight ? rect.top - window.innerHeight : -rect.bottom;
}

function sendUnit(unit: Unit): void {
  const requestSession = session;
  const requestId = id();
  unit.state = 'queued';
  chrome.runtime.sendMessage({
    action: 'translationBatch',
    tabId: undefined,
    pageSessionId: requestSession,
    requestId,
    targetLanguage,
    engine: 'auto',
    style: 'natural',
    units: [{ sourceId: unit.sourceId, text: unit.text }],
  }).then((response) => {
    if (requestSession !== session) return;
    if (!response?.success) {
      console.error('[translation][content] unit failed', { session, requestId, sourceId: unit.sourceId, error: response?.error });
      retryUnit(unit, requestSession);
      return;
    }
    // Successful results are delivered through translationBatchResult so the
    // page render path does not depend on the lifetime of sendResponse.
  }).catch((error) => {
    if (requestSession !== session) return;
    console.error('[translation][content] unit message failed', { session, requestId, sourceId: unit.sourceId, error: String(error) });
    retryUnit(unit, requestSession);
  });
}

function retryUnit(unit: Unit, requestSession: string): void {
  const delay = getTranslationRetryDelay(unit.retryCount);
  if (delay === undefined) {
    unit.state = 'error';
    return;
  }
  unit.retryCount += 1;
  unit.retryTimer = setTimeout(() => {
    unit.retryTimer = undefined;
    if (session !== requestSession || unit.state !== 'queued') return;
    sendUnit(unit);
  }, delay);
}

function sendBatch(): void {
  const pending = Array.from(units.values())
    .filter((unit) => unit.state === 'idle')
    .filter((unit) => viewportPriority(unit) === 0)
    .sort((left, right) => viewportPriority(left) - viewportPriority(right));
  if (!pending.length) {
    console.info('[translation][content] no pending units', { session });
    return;
  }

  const requestId = id();
  console.info('[translation][content] batch sending', {
    session,
    requestId,
    units: pending.length,
    chars: pending.reduce((sum, unit) => sum + unit.text.length, 0),
    targetLanguage,
  });
  pending.forEach(sendUnit);
}

function scan(): void {
  const elements = collect();
  console.info('[translation][content] scan completed', { session, elements: elements.length });
  for (const element of elements) {
    const source = element.textContent!.trim();
    const sourceId = element.dataset.browseronlySourceId || id();
    element.dataset.browseronlySourceId = sourceId;
    if (!units.has(sourceId)) {
      const unit: Unit = {
        sourceId,
        element,
        text: source,
        state: 'idle',
        retryCount: 0,
        originalDisplay: element.style.display,
      };
      units.set(sourceId, unit);
      viewportObserver?.observe(element);
    }
  }
  sendBatch();
}

function render(results: any[]): void {
  for (const result of results) {
    if (result.sourceId === '__title__' && result.translatedText) {
      document.title = mode === 'translation-only'
        ? result.translatedText
        : `${titleOriginal} — ${result.translatedText}`;
      continue;
    }

    const unit = units.get(result.sourceId);
    if (!unit || !result.translatedText) continue;
    unit.translation = String(result.translatedText);
    unit.state = 'translated';

    let translatedElement = unit.element.nextElementSibling as HTMLElement | null;
    if (!translatedElement?.classList.contains('browseronly-translation')) {
      translatedElement = document.createElement('div');
      translatedElement.className = 'browseronly-translation';
      translatedElement.dataset.sourceId = unit.sourceId;
      translatedElement.style.cssText = 'white-space:pre-wrap;color:inherit;opacity:.86;margin:.2em 0;';
      unit.element.insertAdjacentElement('afterend', translatedElement);
    }
    translatedElement.textContent = unit.translation;
    unit.element.style.display = mode === 'translation-only' ? 'none' : unit.originalDisplay;
  }
}

function restore(): void {
  for (const unit of units.values()) {
    unit.element.style.display = unit.originalDisplay;
    const next = unit.element.nextElementSibling;
    if (next?.classList.contains('browseronly-translation')) next.remove();
  }
  if (titleOriginal) document.title = titleOriginal;
}

function createOverlayHost(hostId: string): HTMLDivElement {
  document.getElementById(hostId)?.remove();
  const host = document.createElement('div');
  host.id = hostId;
  host.dataset.browseronlySkip = 'true';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:block;box-sizing:border-box;';
  document.documentElement.appendChild(host);
  return host;
}

function positionNearSelection(host: HTMLElement, anchor = selectionAnchor): void {
  const rect = host.getBoundingClientRect();
  const position = getSelectionOverlayPosition(anchor, rect, { width: window.innerWidth, height: window.innerHeight }, VIEWPORT_GAP);
  const { left, top } = position;
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
}

function currentSelectionAnchor(): DOMRect | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return undefined;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return rect.width || rect.height ? rect : undefined;
}

function showToolbar(): void {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!text || !selection?.rangeCount) return;

  selectionAnchor = selection.getRangeAt(0).getBoundingClientRect();
  const host = createOverlayHost(TOOLBAR_HOST_ID);
  const shadow = host.attachShadow({ mode: 'closed' });
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Translate';
  button.setAttribute('aria-label', 'Translate selected text');
  button.style.cssText = [
    'all:initial',
    'box-sizing:border-box',
    'display:inline-flex',
    'align-items:center',
    'min-height:32px',
    'padding:6px 10px',
    'border:1px solid rgba(255,255,255,.18)',
    'border-radius:7px',
    'background:#202428',
    'box-shadow:0 4px 14px rgba(0,0,0,.22)',
    'color:#fff',
    'font:600 13px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'cursor:pointer',
  ].join(';');
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'translateSelection',
      text,
      sourceId: 'selection',
      requestId: id(),
      targetLanguage,
      engine: 'auto',
      style: 'natural',
    }).catch((error) => console.error('[translation][content] selection message failed', { error: String(error) }));
    host.remove();
  });
  shadow.appendChild(button);
  positionNearSelection(host);
}

function hideToolbar(): void {
  document.getElementById(TOOLBAR_HOST_ID)?.remove();
}

function showSelectionResult(text: string): void {
  selectionAnchor = currentSelectionAnchor() ?? selectionAnchor;
  const host = createOverlayHost(RESULT_HOST_ID);
  host.style.width = `min(480px, calc(100vw - ${VIEWPORT_GAP * 3}px))`;
  const shadow = host.attachShadow({ mode: 'closed' });
  const card = document.createElement('section');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Translation');
  card.style.cssText = [
    'all:initial',
    'box-sizing:border-box',
    'display:flex',
    'flex-direction:column',
    'width:100%',
    'overflow:hidden',
    'border:1px solid rgba(37,53,66,.18)',
    'border-radius:12px',
    'background:#fffdfa',
    'box-shadow:0 14px 38px rgba(20,29,36,.18),0 2px 8px rgba(20,29,36,.08)',
    'color:#20272c',
    'font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC",sans-serif',
  ].join(';');
  const header = document.createElement('header');
  header.style.cssText = 'all:initial;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:9px 10px 8px 14px;border-bottom:1px solid rgba(37,53,66,.1);font:600 12px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#53616b;letter-spacing:.02em;';
  const label = document.createElement('span');
  label.textContent = 'Translation';
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close translation');
  close.textContent = '×';
  close.style.cssText = 'all:initial;box-sizing:border-box;display:grid;place-items:center;width:26px;height:26px;border-radius:7px;color:#65737d;font:400 20px/1 ui-sans-serif;cursor:pointer;';
  close.addEventListener('mouseenter', () => { close.style.background = '#eef1f2'; });
  close.addEventListener('mouseleave', () => { close.style.background = 'transparent'; });
  close.addEventListener('click', () => host.remove());
  const result = document.createElement('div');
  result.setAttribute('role', 'status');
  result.style.cssText = 'all:initial;box-sizing:border-box;display:block;max-height:min(42vh,360px);overflow:auto;padding:14px 16px 16px;color:#20272c;font:400 15px/1.72 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;';
  result.textContent = text;
  header.append(label, close);
  card.append(header, result);
  shadow.appendChild(card);
  positionNearSelection(host);
  window.setTimeout(() => host.remove(), 20000);
}

if (shouldInitialize) chrome.runtime.onMessage.addListener((message: any) => {
  if (message.action === 'startPageTranslation') {
    for (const unit of units.values()) {
      if (unit.retryTimer) clearTimeout(unit.retryTimer);
      unit.retryTimer = undefined;
      unit.retryCount = 0;
      unit.state = resetStateForNewTranslationSession(unit.state);
    }
    session = message.pageSessionId || id();
    mode = message.mode || 'bilingual';
    targetLanguage = message.targetLanguage || targetLanguage;
    console.info('[translation][content] start received', {
      session,
      mode,
      targetLanguage,
      translateTitle: message.translateTitle,
    });
    if (!titleOriginal) titleOriginal = document.title;
    viewportObserver?.disconnect();
    viewportObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        viewportObserver?.unobserve(entry.target);
        const sourceId = (entry.target as HTMLElement).dataset.browseronlySourceId;
        const unit = sourceId ? units.get(sourceId) : undefined;
        if (unit?.state === 'idle') sendUnit(unit);
      }
    }, { root: null, rootMargin: '600px', threshold: 0.1 });
    if (message.translateTitle !== false) {
      const requestId = id();
      console.info('[translation][content] title batch sending', { session, requestId });
      const requestSession = session;
      chrome.runtime.sendMessage({
        action: 'translationBatch',
        pageSessionId: requestSession,
        requestId,
        targetLanguage,
        engine: 'auto',
        units: [{ sourceId: '__title__', text: document.title, kind: 'title' }],
      }).then((response) => {
        if (requestSession === session && response?.success) render(response.results || []);
      }).catch((error) => console.error('[translation][content] title message failed', { session, requestId, error: String(error) }));
    }
    scan();
    observer?.disconnect();
    observer = new MutationObserver(() => scan());
    observer.observe(root(), { childList: true, subtree: true });
  }

  if (message.action === 'translationBatchResult' && message.pageSessionId === session) {
    console.info('[translation][content] batch result received', {
      session,
      requestId: message.requestId,
      results: message.results?.length,
    });
    render(message.results || []);
  }

  if (message.action === 'translationStatus' && message.pageSessionId === session) {
    console.error('[translation][content] translation failed', {
      session,
      requestId: message.requestId,
      error: message.error,
    });
  }

  if (message.action === 'translationSelectionResult') {
    showSelectionResult(message.error || message.translatedText || '');
  }

  if (message.action === 'stopPageTranslation') {
    observer?.disconnect();
    viewportObserver?.disconnect();
    restore();
    session = '';
    for (const unit of units.values()) if (unit.retryTimer) clearTimeout(unit.retryTimer);
    units.clear();
  }

  if (message.action === 'setTranslationMode') {
    mode = message.mode || mode;
    if (mode === 'original') restore();
    else render(Array.from(units.values())
      .filter((unit) => unit.translation)
      .map((unit) => ({ sourceId: unit.sourceId, translatedText: unit.translation })));
  }
});

if (shouldInitialize) document.addEventListener('mouseup', () => window.setTimeout(showToolbar, 0));
if (shouldInitialize) document.addEventListener('mousedown', (event) => {
  const target = event.target as HTMLElement;
  if (!target?.closest?.(`#${TOOLBAR_HOST_ID}`)) hideToolbar();
});

window.addEventListener('resize', () => {
  const toolbar = document.getElementById(TOOLBAR_HOST_ID);
  if (toolbar) positionNearSelection(toolbar);
  const result = document.getElementById(RESULT_HOST_ID);
  if (result) positionNearSelection(result);
});
