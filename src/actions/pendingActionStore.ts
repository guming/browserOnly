import type { ActionInvocation } from './types';
const pending = new Map<string, ActionInvocation>();
const key = (windowId: number, tabId: number) => `${windowId}:${tabId}`;
export function putPendingAction(invocation: ActionInvocation): void { pending.set(key(invocation.windowId, invocation.tabId), invocation); }
export function consumePendingAction(windowId: number, tabId: number): ActionInvocation | undefined { const id = key(windowId, tabId); const value = pending.get(id); pending.delete(id); return value; }
export function clearPendingActionsForTab(tabId: number): void { for (const [id, value] of pending) if (value.tabId === tabId) pending.delete(id); }
