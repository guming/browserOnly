jest.mock('../../src/agent/approvalManager', () => ({ requestApproval: jest.fn().mockResolvedValue(true) }));
import { WorkflowRunner } from '../../src/workflows/WorkflowRunner';
import { ReplayFailure } from '../../src/workflows/ReplayLocatorResolver';
import { requestApproval } from '../../src/agent/approvalManager';
const step: any = { id: 'cart', type: 'action', label: 'Add cart', toolName: 'browser_click', input: '#cart', enabled: true, timeoutMs: 100, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onFailure: 'repair', risk: 'write' };
const version: any = { id: 'v', workflowId: 'w', replayFormat: 'steps-v2', steps: [step], finalAssertions: [] };
function setup() { const store = { saveRun: jest.fn().mockResolvedValue(undefined), saveStepRun: jest.fn().mockResolvedValue(undefined), saveTraceEvent: jest.fn().mockResolvedValue(undefined) }; return { store, runner: new WorkflowRunner(store), options: { tools: [{ name: 'browser_click', func: jest.fn() }], executeReplay: jest.fn().mockResolvedValue('Clicked'), repairQuery: jest.fn().mockResolvedValue('#newcart') } }; }
test('direct replay uses zero model calls and records unverified completion', async () => {
  const { runner, options, store } = setup(); const run = await runner.run('w', version, options);
  expect(run).toMatchObject({ status: 'succeeded', llmCalls: 0, verification: 'unverified' });
  expect(options.repairQuery).not.toHaveBeenCalled(); expect(store.saveTraceEvent).toHaveBeenCalled();
});
test('repairs only failed locator and counts model attempt', async () => {
  const { runner, options } = setup(); options.executeReplay.mockRejectedValueOnce(new ReplayFailure('locate', 'missing'));
  const run = await runner.run('w', version, options);
  expect(run).toMatchObject({ status: 'succeeded', llmCalls: 1 }); expect(options.repairQuery).toHaveBeenCalledTimes(1); expect(options.executeReplay).toHaveBeenCalledTimes(2);
});
test('uncertain write verified without second click', async () => {
  const { runner, options } = setup(); options.executeReplay.mockRejectedValueOnce(new ReplayFailure('act', 'response lost'));
  options.tools.push({ name: 'browser_read_text', func: jest.fn().mockResolvedValue('cart added') });
  const run = await runner.run('w', { ...version, steps: [{ ...step, postconditions: [{ type: 'text_present', expected: 'cart added' }] }] }, options);
  expect(run.status).toBe('succeeded'); expect(options.executeReplay).toHaveBeenCalledTimes(1); expect(options.repairQuery).not.toHaveBeenCalled();
});
test('unverified uncertain write fails without retry', async () => {
  const { runner, options } = setup(); options.executeReplay.mockRejectedValueOnce(new ReplayFailure('act', 'response lost'));
  expect((await runner.run('w', version, options)).status).toBe('failed'); expect(options.executeReplay).toHaveBeenCalledTimes(1); expect(options.repairQuery).not.toHaveBeenCalled();
});
test('cancel during repair prevents action', async () => {
  const { runner, options } = setup(); options.executeReplay.mockRejectedValueOnce(new ReplayFailure('locate', 'missing'));
  options.repairQuery.mockImplementation(async () => { runner.cancel(); return '#newcart'; });
  expect((await runner.run('w', version, options)).status).toBe('cancelled'); expect(options.executeReplay).toHaveBeenCalledTimes(1);
});
test('rejected approval stops action', async () => {
  const { runner, options } = setup(); (requestApproval as jest.Mock).mockResolvedValueOnce(false);
  expect((await runner.run('w', version, { ...options, context: { tabId: 1 } })).status).toBe('failed'); expect(options.executeReplay).not.toHaveBeenCalled();
});
test('run repair budget limits failed steps and preserves subsequent steps', async () => {
  const { runner, options } = setup();
  options.executeReplay.mockRejectedValueOnce(new ReplayFailure('locate', 'missing')).mockResolvedValueOnce('clicked').mockRejectedValueOnce(new ReplayFailure('locate', 'missing'));
  const run = await runner.run('w', { ...version, replayPolicy: { maxRepairsPerRun: 1 }, steps: [step, { ...step, id: 'second' }] }, options);
  expect(run.status).toBe('failed'); expect(run.failureMessage).toContain('Repair budget exhausted'); expect(options.repairQuery).toHaveBeenCalledTimes(1);
});
