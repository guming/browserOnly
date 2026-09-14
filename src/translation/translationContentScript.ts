export function createPageTranslationStartMessage(
  message: Record<string, unknown>,
  settings: { targetLanguage: string; translateTitle: boolean },
  pageSessionId: string,
): Record<string, unknown> {
  return {
    ...message,
    action: 'startPageTranslation',
    targetLanguage: message.targetLanguage || settings.targetLanguage,
    translateTitle: message.translateTitle ?? settings.translateTitle,
    pageSessionId,
  };
}

export async function sendToTranslationContentScript(tabId: number, message: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['pageTranslation.js'],
      });
      await chrome.tabs.sendMessage(tabId, message);
    } catch (injectionError) {
      throw new Error(`Unable to start translation on this page: ${String(injectionError || firstError)}`);
    }
  }
}

export async function deliverTranslationBatchResult(
  tabId: number,
  message: { pageSessionId: string; requestId: string },
  results: unknown[],
): Promise<void> {
  await chrome.tabs.sendMessage(tabId, {
    action: 'translationBatchResult',
    pageSessionId: message.pageSessionId,
    requestId: message.requestId,
    results,
  });
}
