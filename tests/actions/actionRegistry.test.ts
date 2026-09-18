import { ActionRegistry } from '../../src/actions/actionRegistry';
describe('ActionRegistry', () => {
  it('matches slash aliases', () => { expect(new ActionRegistry().search('/sum', { hasPage: true })[0]?.id).toBe('summarize'); });
  it('hides compare without two tabs', () => { expect(new ActionRegistry().search('/compare', { hasPage: true, comparableTabCount: 1 })).toHaveLength(0); });
  it('shows compare with two tabs', () => { expect(new ActionRegistry().search('/compare', { comparableTabCount: 2 })[0]?.id).toBe('compare'); });
});
