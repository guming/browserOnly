import React, { useEffect, useState } from 'react';
import type { ActionInvocation } from '../../../actions';
interface Props { tabId?: number; windowId?: number; onAction: (invocation: ActionInvocation) => void; }
export function PendingActionRouter({ tabId, windowId, onAction }: Props) {
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (tabId === undefined || windowId === undefined) return;
    const pendingKey = `pendingAction:${windowId}:${tabId}`;
    const consume = () => chrome.runtime.sendMessage({ action: 'getPendingAction', tabId, windowId }, (response?: { invocation?: ActionInvocation; error?: string }) => {
      if (response?.invocation) onAction(response.invocation);
      else if (response?.error) setError(response.error);
    });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[pendingKey]?.newValue) consume();
    };
    chrome.storage.onChanged.addListener(onChanged);
    consume();
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [tabId, windowId, onAction]);
  return error ? <div role="alert">{error}</div> : null;
}
