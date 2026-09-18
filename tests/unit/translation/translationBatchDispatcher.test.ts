import { dispatchTranslationBatch } from '../../../src/translation/translationBatchDispatcher';

describe('translation batch message lifetime', () => {
  it('acknowledges immediately and delivers a slow result separately', async () => {
    let resolveModel!: (results: any[]) => void;
    const enqueue = jest.fn(() => new Promise<any[]>(resolve => { resolveModel = resolve; }));
    const deliverResults = jest.fn().mockResolvedValue(undefined);
    const deliverError = jest.fn().mockResolvedValue(undefined);
    const sendResponse = jest.fn();
    const message = { pageSessionId: 'page-1', requestId: 'request-1', units: [{ sourceId: '1', text: 'hello' }] };

    const keepChannelOpen = dispatchTranslationBatch(
      message,
      { tab: { id: 42 } } as chrome.runtime.MessageSender,
      sendResponse,
      { enqueue, deliverResults, deliverError },
    );

    expect(keepChannelOpen).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true, accepted: true }));
    expect(deliverResults).not.toHaveBeenCalled();

    const results = [{ sourceId: '1', translatedText: '你好' }];
    resolveModel(results);
    await Promise.resolve();
    await Promise.resolve();
    expect(deliverResults).toHaveBeenCalledWith(42, message, results);
  });
});
