import { deliverTranslationBatchResult, sendToTranslationContentScript } from '../../../src/translation/translationContentScript';

describe('translation content-script messaging', () => {
  it('injects the translation content script into an existing tab and retries', async () => {
    const sendMessage = chrome.tabs.sendMessage as jest.Mock;
    const executeScript = chrome.scripting.executeScript as jest.Mock;
    sendMessage
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce(undefined);

    await sendToTranslationContentScript(42, { action: 'startPageTranslation' });

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['pageTranslation.js'],
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith(42, { action: 'startPageTranslation' });
  });

  it('does not inject again when the content script is already listening', async () => {
    const sendMessage = chrome.tabs.sendMessage as jest.Mock;
    const executeScript = chrome.scripting.executeScript as jest.Mock;
    sendMessage.mockResolvedValueOnce(undefined);

    await sendToTranslationContentScript(7, { action: 'translationSelectionResult' });

    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('delivers completed batch results explicitly to the originating tab', async () => {
    const sendMessage = chrome.tabs.sendMessage as jest.Mock;
    sendMessage.mockResolvedValueOnce(undefined);
    const results = [{ sourceId: 'paragraph-1', translatedText: '译文' }];

    await deliverTranslationBatchResult(
      42,
      { pageSessionId: 'page-session', requestId: 'request-1' },
      results,
    );

    expect(sendMessage).toHaveBeenCalledWith(42, {
      action: 'translationBatchResult',
      pageSessionId: 'page-session',
      requestId: 'request-1',
      results,
    });
  });
});
