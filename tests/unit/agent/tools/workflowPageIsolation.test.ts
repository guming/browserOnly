import { PageContextManager } from '../../../../src/agent/PageContextManager';
import { preferProvidedPageForTools, withActivePage } from '../../../../src/agent/tools/utils';

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
});
