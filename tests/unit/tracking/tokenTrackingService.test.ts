import 'openai/shims/node';

jest.mock('../../../src/background/configManager', () => ({
  ConfigManager: {
    getInstance: () => ({
      getProviderConfig: jest.fn().mockResolvedValue({
        provider: 'anthropic',
        apiModelId: 'claude-sonnet-4-20250514',
      }),
    }),
  },
}));

import { TokenTrackingService } from '../../../src/tracking/tokenTrackingService';

describe('TokenTrackingService pricing', () => {
  const tracker = TokenTrackingService.getInstance();

  beforeEach(() => {
    tracker.reset();
  });

  it('prices regular, cache-write, cache-read, and output tokens separately', () => {
    tracker.updateProviderAndModel('anthropic', 'claude-sonnet-4-20250514');

    tracker.trackInputTokens(10_000, { write: 20_000, read: 70_000 });
    tracker.trackOutputTokens(20_000);

    expect(tracker.getUsage()).toEqual({
      inputTokens: 100_000,
      outputTokens: 20_000,
      cost: 0.426,
    });
  });

  it('does not reprice historical usage when the selected model changes', () => {
    tracker.updateProviderAndModel('anthropic', 'claude-3-5-haiku-20241022');
    tracker.trackInputTokens(1_000_000);

    tracker.updateProviderAndModel('anthropic', 'claude-opus-4-20250514');
    expect(tracker.getUsage().cost).toBeCloseTo(0.8, 10);

    tracker.trackOutputTokens(1_000_000);
    expect(tracker.getUsage().cost).toBeCloseTo(75.8, 10);
  });
});
