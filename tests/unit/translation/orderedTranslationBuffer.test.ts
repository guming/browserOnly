import {
  getTranslationRetryDelay,
  OrderedTranslationBuffer,
  resetStateForNewTranslationSession,
} from '../../../src/translation/orderedTranslationBuffer';

describe('OrderedTranslationBuffer', () => {
  it('holds later results until earlier results complete', () => {
    const buffer = new OrderedTranslationBuffer<string>();

    expect(buffer.complete(1, 'second')).toEqual([]);
    expect(buffer.complete(0, 'first')).toEqual(['first', 'second']);
  });

  it('allows a failed position to release later completed results', () => {
    const buffer = new OrderedTranslationBuffer<string[]>();

    expect(buffer.complete(1, ['second'])).toEqual([]);
    expect(buffer.complete(0, [])).toEqual([[], ['second']]);
  });

  it('drops pending results when a new session resets the buffer', () => {
    const buffer = new OrderedTranslationBuffer<string>();
    buffer.complete(1, 'stale');
    buffer.reset();

    expect(buffer.complete(0, 'fresh')).toEqual(['fresh']);
  });

  it('limits automatic retries to two attempts', () => {
    expect(getTranslationRetryDelay(0)).toBe(500);
    expect(getTranslationRetryDelay(1)).toBe(1500);
    expect(getTranslationRetryDelay(2)).toBeUndefined();
  });

  it('unlocks queued and failed units when a new session starts', () => {
    expect(resetStateForNewTranslationSession('queued')).toBe('idle');
    expect(resetStateForNewTranslationSession('error')).toBe('idle');
    expect(resetStateForNewTranslationSession('translated')).toBe('translated');
  });
});
