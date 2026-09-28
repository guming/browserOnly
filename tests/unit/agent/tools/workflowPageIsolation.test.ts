import { PageContextManager } from '../../../../src/agent/PageContextManager';
import { preferProvidedPageForTools, retryAfterNavigation, withActivePage } from '../../../../src/agent/tools/utils';

describe('workflow page isolation', () => {
  afterEach(() => PageContextManager.getInstance().reset());

  it('uses the workflow execution page even when the global active page differs', async () => {
    const globalPage = { url: jest.fn(() => 'https://old.example/') } as any;
    const workflowPage = { url: jest.fn(() => 'https://www.jd.com/') } as any;
    PageContextManager.getInstance().setCurrentPage(globalPage);
    preferProvidedPageForTools(workflowPage);

    const selected = await withActivePage(workflowPage, async page => page);

    expect(selected).toBe(workflowPage);
  });

  it('retries a read-only operation after navigation replaces its execution context', async () => {
    const page = { waitForLoadState: jest.fn().mockResolvedValue(undefined) } as any;
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('Execution context was destroyed, most likely because of a navigation'))
      .mockResolvedValueOnce('JD Search Results');

    const result = await retryAfterNavigation(page, operation);

    expect(page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 5000 });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(result).toBe('JD Search Results');
  });
});
