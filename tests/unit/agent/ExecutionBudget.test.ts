import { ExecutionBudget } from '../../../src/agent/ExecutionBudget';
const failure = { ok: false, error: { code: 'NO_MATCH', message: 'Missing', repairable: true } };
it('allows exactly 50 calls and a subsequent summary request', () => {
  const budget = new ExecutionBudget();
  for (let i = 0; i < 50; i++) { expect(budget.beforeCall('read', '')).toBeUndefined(); budget.called(); }
  expect(budget.beforeCall('read', '')).toBe('TOOL_BUDGET');
  expect(budget.request()).toBeUndefined();
});
it('bounds protocol repairs separately and resets them after parsing', () => {
  const budget = new ExecutionBudget();
  for (let i = 0; i < 3; i++) expect(budget.repair()).toBeUndefined();
  expect(budget.repair()).toBe('PROTOCOL_REPAIR_LIMIT');
  budget.parsed(); expect(budget.repair()).toBeUndefined();
});
it('bounds model requests independently', () => {
  const budget = new ExecutionBudget();
  for (let i = 0; i < 80; i++) expect(budget.request()).toBeUndefined();
  expect(budget.request()).toBe('REQUEST_BUDGET');
});
it('blocks the third identical failure and fifth failed parameter variation', () => {
  const budget = new ExecutionBudget();
  budget.record('query', 'x', failure); expect(budget.beforeCall('query', 'x')).toBeUndefined();
  expect(budget.record('query', 'x', failure)).toContain('re-observe');
  expect(budget.beforeCall('query', 'x')).toBe('REPEATED_FAILURE');
  for (const input of ['a', 'b', 'c']) budget.record('query', input, failure);
  expect(budget.beforeCall('query', 'new')).toBe('REPEATED_FAILURE');
  budget.record('snapshot', '', { ok: true }); expect(budget.beforeCall('query', 'x')).toBe('REPEATED_FAILURE');
});
it('never retries denied approval', () => {
  const budget = new ExecutionBudget();
  budget.record('click', 'buy', { ok: false, error: { code: 'APPROVAL_DENIED', message: 'Denied', repairable: false } });
  expect(budget.beforeCall('click', 'buy')).toBe('REPEATED_FAILURE');
});
it('retains failed clicks across successful DOM observations', () => {
  const budget = new ExecutionBudget();
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(budget.beforeCall('browser_click', '京东自营')).toBeUndefined();
    budget.called(); budget.record('browser_click', '京东自营', failure);
    budget.called(); budget.record('browser_query', 'dropdown', { ok: true, data: 'menu' });
  }
  expect(budget.beforeCall('browser_click', '京东自营')).toBe('REPEATED_FAILURE');
});
it('clears only the failures of the operation that actually succeeded', () => {
  const budget = new ExecutionBudget();
  budget.record('browser_click', 'old', failure);
  budget.record('browser_click', 'old', failure);
  budget.record('browser_click', 'new', { ok: true });
  expect(budget.beforeCall('browser_click', 'old')).toBe('REPEATED_FAILURE');
  budget.record('browser_click', 'old', { ok: true });
  expect(budget.beforeCall('browser_click', 'old')).toBeUndefined();
});

it('warns before the tool budget is exhausted', () => {
  const budget = new ExecutionBudget();
  expect(budget.guidance()).toBe('');
  for (let i = 0; i < 40; i++) budget.called();
  expect(budget.guidance()).toContain('10 calls remain');
  for (let i = 0; i < 10; i++) budget.called();
  expect(budget.guidance()).toContain('0 calls remain');
});
it('warns on consecutive exploration without forbidding necessary precise observations', () => {
  const budget = new ExecutionBudget();
  expect(budget.record('browser_query', 'old', { ok: true })).toBe('');
  budget.record('browser_snapshot_dom', '', { ok: true });
  expect(budget.record('browser_read_text', '', { ok: true })).toContain('exact text');
  expect(budget.beforeCall('browser_control_state', '{"text":"京东物流"}')).toBeUndefined();
  budget.record('browser_click', '京东物流', { ok: true });
  expect(budget.record('browser_control_state', '京东物流', { ok: true })).toBe('');
});
