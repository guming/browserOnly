export function getOllamaExtensionOrigin(): string {
  return chrome.runtime.getURL('').replace(/\/$/, '');
}

export function getOllamaStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;

  const responseError = error as {
    status?: unknown;
    statusCode?: unknown;
    status_code?: unknown;
    message?: unknown;
  };
  const explicitStatus = [responseError.status, responseError.statusCode, responseError.status_code]
    .find((value): value is number => typeof value === 'number');
  if (explicitStatus !== undefined) return explicitStatus;

  if (typeof responseError.message === 'string') {
    const match = responseError.message.match(/\b(?:HTTP|Error)\s+(\d{3})\b/i);
    if (match) return Number(match[1]);
  }

  return null;
}

export function getOllamaConnectionError(status: number | null, extensionOrigin: string): string {
  if (status === 403) {
    return `Ollama rejected this extension origin. Add ${extensionOrigin} to OLLAMA_ORIGINS, fully restart Ollama, then try again.`;
  }

  if (status !== null) {
    return `Ollama returned HTTP ${status}. Check the Base URL and Ollama server logs.`;
  }

  return 'Could not reach Ollama. Check that it is running and that the Base URL is correct.';
}
