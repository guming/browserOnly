import React, { useEffect, useState } from 'react';
import type { ActionInvocation } from '../../../actions';
interface Props { tabId?: number; windowId?: number; onAction: (invocation: ActionInvocation) => void; }
export function PendingActionRouter({ tabId, windowId, onAction }: Props) {
  const [error, setError] = useState<string>();
  useEffect(() => { if (tabId === undefined || windowId === undefined) return; chrome.runtime.sendMessage({ action: 'getPendingAction', tabId, windowId }, (response?: { invocation?: ActionInvocation; error?: string }) => { if (response?.invocation) onAction(response.invocation); else if (response?.error) setError(response.error); }); }, [tabId, windowId, onAction]);
  return error ? <div role="alert">{error}</div> : null;
}
