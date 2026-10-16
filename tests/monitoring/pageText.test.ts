import { extractPageTextInPage } from '../../src/monitoring/MonitorExtractor';
import { createDiff } from '../../src/monitoring/DiffEngine';
import { notifyMonitorChange } from '../../src/monitoring/NotificationService';
import { hashText, normalizeText } from '../../src/monitoring/normalizers';
import type { Monitor, MonitorSnapshot } from '../../src/monitoring/types';

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

  test('shows only the changed count in unspaced Chinese page text', () => {
    const prefix = '支持销售设计市场游戏策划教研教学工作地点北京上海深圳杭州广州成都西安更多开启新的工作（';
    const suffix = '）良率工程师（存算与AI）';
    const diff = createDiff(snapshot('old', `${prefix}4676${suffix}`), snapshot('new', `${prefix}4675${suffix}`));
    expect(diff.addedText).toEqual(['4675']);
    expect(diff.removedText).toEqual(['4676']);
    expect(diff.significance).toBe('low');
  });

  test('notification describes the changed count without the page text', async () => {
    const prefix = '支持销售设计市场游戏策划教研教学工作地点北京上海深圳杭州广州成都西安更多开启新的工作（';
    const diff = createDiff(snapshot('old', `${prefix}4676）`), snapshot('new', `${prefix}4675）`));
    const create = jest.fn().mockResolvedValue('notification');
    Object.defineProperty(global, 'chrome', { configurable: true, value: { notifications: { create } } });
    await notifyMonitorChange({ name: 'Jobs', kind: 'page_text' } as Monitor, diff);
    expect(create).toHaveBeenCalledWith(`monitor-diff:${diff.id}`, expect.objectContaining({ message: 'Removed: 4676 | Added: 4675' }));
  });
});
