import { extractPageTextInPage } from '../../src/monitoring/MonitorExtractor';
import { createDiff } from '../../src/monitoring/DiffEngine';
import { hashText, normalizeText } from '../../src/monitoring/normalizers';
import type { MonitorSnapshot } from '../../src/monitoring/types';

const snapshot = (id: string, text: string): MonitorSnapshot => {
  const value = normalizeText(text, 200_000);
  return { id, monitorId: 'page', runId: id, observedAt: 1, url: 'https://example.com', pageTitle: 'Page', kind: 'page_text', rawValue: text, normalizedValue: value, contentHash: hashText(value.text) };
};

describe('page text monitoring', () => {
  test('extracts main content and removes navigation and hidden nodes', () => {
    document.body.innerHTML = '<nav>Menu</nav><main><h1>Article</h1><p>Useful content</p><p hidden>Secret</p><script>bad()</script></main><footer>Footer</footer>';
    const result = extractPageTextInPage();
    expect(result.value).toContain('Useful content');
    expect(result.value).not.toContain('Menu');
    expect(result.value).not.toContain('Secret');
    expect(result.value).not.toContain('bad');
  });

  test('marks tiny page changes as low significance', () => {
    const common = Array.from({ length: 500 }, (_, index) => `word${index}`).join(' ');
    const diff = createDiff(snapshot('old', common), snapshot('new', `${common} extra`));
    expect(diff.changed).toBe(true);
    expect(diff.significance).toBe('low');
  });
});
