import { ActionRegistry, ActionResolver, createWorkflowActions } from '../../src/actions';
import type { Workflow } from '../../src/workflows/types';

describe('ActionResolver and workflow actions', () => {
  it('routes actions by their declared run behavior', () => {
    const resolver = new ActionResolver(new ActionRegistry());
    expect(resolver.resolve({ actionId: 'summarize', source: 'page_actions', tabId: 1, windowId: 2, pageUrl: 'https://example.com' }).type).toBe('direct');
    expect(resolver.resolve({ actionId: 'extract', source: 'page_actions', tabId: 1, windowId: 2, pageUrl: 'https://example.com' }).type).toBe('configure');
  });

  it('creates deterministic unique aliases for duplicate workflow names', () => {
    const base: Workflow = { id: 'workflow-aaaa1111', name: 'Weekly jobs', description: '', schemaVersion: 1, status: 'active', triggerDomains: [], variables: [], activeVersionId: 'v1', executionMode: 'current_tab', createdAt: 1, updatedAt: 1 };
    const actions = createWorkflowActions([{ ...base, id: 'workflow-bbbb2222' }, base]);
    expect(new Set(actions.map(action => action.slashCommand)).size).toBe(2);
    expect(actions.every(action => action.runBehavior === 'confirm')).toBe(true);
  });
});
