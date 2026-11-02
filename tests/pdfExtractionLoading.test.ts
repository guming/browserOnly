import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const script = readFileSync(join(process.cwd(), 'public/pdf-text-extract.js'), 'utf8');

describe('PDF extraction readiness', () => {
  let listeners: Record<string, Set<(event?: any) => void>>;
  let app: any;
  const dispatch = (type: string, event = {}) => [...(listeners[type] || [])].forEach(fn => fn(event));

  beforeEach(() => {
    document.body.innerHTML = `<button id="extractTextButton"></button><div id="textExtractionPanel"></div><div id="extractedContent"></div><div id="extractionLoading"></div><div id="extractionProgress"></div><div class="paper-container"></div><div id="extractionEmptyState"></div><div id="linksLoading"></div>`;
    localStorage.setItem('pdfTextPanelOpen', 'true');
    listeners = {};
    app = { pdfDocument: null, eventBus: {
      on: (name: string, fn: (event?: any) => void) => (listeners[name] ||= new Set()).add(fn),
      off: (name: string, fn: (event?: any) => void) => listeners[name]?.delete(fn),
    } };
    (window as any).PDFViewerApplication = app;
    window.eval(script);
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });
  afterEach(() => { localStorage.clear(); delete (window as any).PDFViewerApplication; delete (window as any).PDFTextExtractor; });

  test('waits for document load and shares extraction with concurrent callers', async () => {
    const extractor = (window as any).PDFTextExtractor;
    const first = extractor.triggerExtraction();
    expect(extractor.triggerExtraction()).toBe(first);
    expect(document.getElementById('extractionProgress')?.textContent).toContain('Waiting');
    expect(document.getElementById('extractedContent')?.textContent).not.toContain('No PDF');
    const getPage = jest.fn().mockResolvedValue({ getViewport: () => ({ width: 500, height: 700 }), getTextContent: async () => ({ items: [] }), getAnnotations: async () => [] });
    app.pdfDocument = { numPages: 1, getPage };
    dispatch('documentloaded');
    await first;
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(document.getElementById('extractionLoading')?.style.display).toBe('none');
    expect(document.getElementById('extractionEmptyState')?.hidden).toBe(false);
  });

  test('ends waiting and reports a document load failure', async () => {
    const pending = (window as any).PDFTextExtractor.triggerExtraction();
    dispatch('documenterror', { reason: 'Network unavailable' });
    await expect(pending).rejects.toThrow('Network unavailable');
    expect(document.getElementById('extractedContent')?.textContent).toContain('Network unavailable');
    expect(document.getElementById('linksLoading')?.textContent).toContain('Could not scan');
    expect(document.getElementById('extractionLoading')?.style.display).toBe('none');
  });
});
