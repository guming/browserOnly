import { resolveReplayLocator } from '../../src/workflows/ReplayLocatorResolver';
import { executeReplayStep } from '../../src/workflows/ReplayStepExecutor';
const step: any = { toolName: 'browser_click', label: 'cart', timeoutMs: 100, locator: { text: '加入购物车', css: '#cart', fallbackOrder: ['text', 'css'] } };
const target = (count: number) => ({ count: jest.fn().mockResolvedValue(count), isVisible: jest.fn().mockResolvedValue(true), isEnabled: jest.fn().mockResolvedValue(true), click: jest.fn().mockResolvedValue(undefined), fill: jest.fn().mockResolvedValue(undefined) });
test('uses fallback without invoking model', async () => {
  const cart = target(1); const page: any = { getByText: () => target(0), locator: () => cart };
  expect(await resolveReplayLocator(page, step)).toBe(cart);
});
test('ambiguous match never clicks or falls back to a different item', async () => {
  const cart = target(1); const page: any = { getByText: () => target(2), locator: () => cart };
  await expect(executeReplayStep(page, step, '', new AbortController().signal)).rejects.toThrow('Ambiguous');
  expect(cart.click).not.toHaveBeenCalled();
});
test('preserves input including separators and stops before action when cancelled', async () => {
  const cart = target(1); const page: any = { locator: () => cart };
  const type = { ...step, toolName: 'browser_type', locator: { css: '#q', fallbackOrder: ['css'] } };
  await executeReplayStep(page, type, '#q|肽敏舒|规格', new AbortController().signal);
  expect(cart.fill).toHaveBeenCalledWith('肽敏舒|规格', expect.any(Object));
  const controller = new AbortController(); controller.abort();
  await expect(executeReplayStep(page, step, '', controller.signal)).rejects.toThrow();
  expect(cart.click).not.toHaveBeenCalled();
});
