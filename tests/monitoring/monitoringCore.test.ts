import { createDiff } from '../../src/monitoring/DiffEngine';
import { evaluateTrigger } from '../../src/monitoring/TriggerEvaluator';
import { hashText, normalizePrice, normalizeStock, normalizeText, valueText } from '../../src/monitoring/normalizers';
import type { MonitorSnapshot } from '../../src/monitoring/types';

beforeAll(() => {
  if (!global.crypto.randomUUID) Object.defineProperty(global.crypto, 'randomUUID', { value: () => 'test-uuid' });
});

function snapshot(id: string, text: string): MonitorSnapshot {
  const normalizedValue = normalizeText(text);
  return { id, monitorId: 'monitor-1', runId: `run-${id}`, observedAt: Date.now(), url: 'https://example.com', pageTitle: 'Example', kind: 'text', rawValue: text, normalizedValue, contentHash: hashText(normalizedValue.text) };
}

function typedSnapshot(id: string, value: MonitorSnapshot['normalizedValue']): MonitorSnapshot {
  return { id, monitorId: 'monitor-1', runId: `run-${id}`, observedAt: Date.now(), url: 'https://example.com', pageTitle: 'Example', kind: value.type === 'price' ? 'price' : 'stock', rawValue: valueText(value), normalizedValue: value, contentHash: hashText(valueText(value)) };
}

describe('monitoring text core', () => {
  test('normalizes visible-equivalent text deterministically', () => {
    expect(normalizeText('  Cafe\u0301\u00a0\u200b  price  ').text).toBe('Café price');
    expect(normalizeText('x'.repeat(20_001)).text).toHaveLength(20_000);
  });

  test('creates bounded structured diffs', () => {
    const diff = createDiff(snapshot('old', 'red small shirt'), snapshot('new', 'blue small shirt'));
    expect(diff.changed).toBe(true);
    expect(diff.changeType).toBe('text_changed');
    expect(diff.addedText).toEqual(['blue']);
    expect(diff.removedText).toEqual(['red']);
  });

  test('does not report equal normalized values as changed', () => {
    expect(createDiff(snapshot('old', 'hello   world'), snapshot('new', 'hello world')).changed).toBe(false);
  });

  test('notifies only on false-to-true keyword transitions', () => {
    const trigger = { type: 'text_appears', text: 'sale', caseSensitive: false } as const;
    const first = evaluateTrigger(trigger, normalizeText('SALE today'), undefined, false);
    const repeated = evaluateTrigger(trigger, normalizeText('sale today'), undefined, first.nextTriggerActive);
    const recovered = evaluateTrigger(trigger, normalizeText('regular price'), undefined, repeated.nextTriggerActive);
    const again = evaluateTrigger(trigger, normalizeText('sale again'), undefined, recovered.nextTriggerActive);
    expect([first.shouldNotify, repeated.shouldNotify, recovered.shouldNotify, again.shouldNotify]).toEqual([true, false, false, true]);
  });

  test('changed trigger is a one-run event', () => {
    const diff = createDiff(snapshot('old', 'one'), snapshot('new', 'two'));
    expect(evaluateTrigger({ type: 'changed' }, normalizeText('two'), diff, false)).toEqual({ conditionMet: true, shouldNotify: true, nextTriggerActive: false });
  });

  test.each([
    ['$1,299.00', { amount: 1299, currency: 'USD', qualifier: 'exact' }],
    ['€1.299,50', { amount: 1299.5, currency: 'EUR', qualifier: 'exact' }],
    ['￥899 起', { amount: 899, currency: 'CNY', qualifier: 'from' }],
    ['USD 10 - 20', { amount: 10, currency: 'USD', qualifier: 'range' }],
  ])('normalizes price %s', (raw, expected) => expect(normalizePrice(raw)).toEqual({ type: 'price', ...expected }));

  test('creates price deltas and applies currency-safe threshold triggers', () => {
    const before = typedSnapshot('old', normalizePrice('$100.00'));
    const after = typedSnapshot('new', normalizePrice('$80.00'));
    const diff = createDiff(before, after);
    expect(diff).toEqual(expect.objectContaining({ changeType: 'decrease', numericDelta: -20, percentDelta: -20 }));
    expect(evaluateTrigger({ type: 'price_decreases' }, after.normalizedValue, diff, false).shouldNotify).toBe(true);
    expect(evaluateTrigger({ type: 'price_below', amount: 90, currency: 'EUR' }, after.normalizedValue, diff, false).shouldNotify).toBe(false);
  });

  test('maps stock indicator disappearance to the opposite state', () => {
    const out = normalizeStock(true, 'Out of stock', 'out_of_stock');
    const available = normalizeStock(false, '', 'out_of_stock');
    const diff = createDiff(typedSnapshot('old', out), typedSnapshot('new', available));
    expect(diff.changeType).toBe('stock_changed');
    expect(evaluateTrigger({ type: 'back_in_stock' }, available, diff, false).shouldNotify).toBe(true);
  });

  test('unknown stock never triggers', () => {
    expect(evaluateTrigger({ type: 'back_in_stock' }, normalizeStock(true, 'Unknown', undefined), undefined, false).shouldNotify).toBe(false);
  });
});
