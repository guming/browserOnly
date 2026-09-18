export interface TranslationBatchDispatcherDependencies {
  enqueue: (message: any) => Promise<any[]>;
  deliverResults: (tabId: number, message: any, results: any[]) => Promise<void>;
  deliverError: (tabId: number, message: any, error: unknown) => Promise<void>;
}

/**
 * Acknowledge the content-script message synchronously, then deliver the slow
 * model result over a separate message. This avoids holding a Chrome message
 * port open for the duration of local inference.
 */
export function dispatchTranslationBatch(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
  dependencies: TranslationBatchDispatcherDependencies,
): boolean {
  const tabId = message.tabId ?? sender.tab?.id;
  if (typeof tabId !== 'number') {
    sendResponse({ success: false, error: 'tabId required' });
    return false;
  }

  sendResponse({
    success: true,
    accepted: true,
    pageSessionId: message.pageSessionId,
    requestId: message.requestId,
  });

  void dependencies.enqueue({ ...message, tabId })
    .then(results => dependencies.deliverResults(tabId, message, results))
    .catch(error => dependencies.deliverError(tabId, message, error));

  return false;
}
