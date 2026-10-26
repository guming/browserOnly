import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(process.cwd(), 'public/monitor-compare.html'), 'utf8');
const script = readFileSync(join(process.cwd(), 'public/monitor-compare.js'), 'utf8');

function pageWith(payload: unknown) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;
  const sendMessage = jest.fn().mockResolvedValue({ success: true, data: payload });
  new Function('chrome', 'document', 'location', script)(
    { runtime: { sendMessage } }, document, { search: '?monitorId=monitor-1&diffId=diff-1' },
  );
  return sendMessage;
}

const snapshot = (id: string, text: string) => ({
  id, monitorId: 'monitor-1', observedAt: id === 'old' ? 1000 : 2000,
  rawValue: text, url: 'https://example.com/updates', normalizedValue: { type: 'text', text },
});

describe('monitor comparison page', () => {
  test('shows changed lines from the selected snapshots without interpreting page HTML', async () => {
    const sendMessage = pageWith({
      monitor: { name: '更新公告' }, diff: { changed: true },
      before: snapshot('old', '相同内容\n旧说明'),
      after: snapshot('new', '相同内容\n<img src=x onerror=alert(1)>\n新说明'),
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sendMessage).toHaveBeenCalledWith({ action: 'monitorCompareGet', monitorId: 'monitor-1', diffId: 'diff-1' });
    expect(document.getElementById('title')?.textContent).toBe('更新公告有变化');
    expect(document.querySelectorAll('#before-content .removed')).toHaveLength(1);
    expect(document.querySelectorAll('#after-content .added')).toHaveLength(2);
    expect(document.querySelector('#after-content img')).toBeNull();
    expect(document.getElementById('after-content')?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  test('shows a price change as a compact value comparison', async () => {
    pageWith({
      monitor: { name: '相机价格' }, diff: { changed: true, numericDelta: -400 },
      before: { ...snapshot('old', '¥8,199'), normalizedValue: { type: 'price', amount: 8199, currency: 'CNY' } },
      after: { ...snapshot('new', '¥7,799'), normalizedValue: { type: 'price', amount: 7799, currency: 'CNY' } },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.getElementById('before-content')?.textContent).toBe('¥8,199');
    expect(document.getElementById('after-content')?.textContent).toBe('¥7,799');
    expect(document.getElementById('summary')?.textContent).toBe('¥8,199 → ¥7,799');
  });
});
