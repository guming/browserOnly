import type { ActionInvocation } from './types';
const PREFIX = 'pendingAction:';
const key = (windowId: number, tabId: number) => `${PREFIX}${windowId}:${tabId}`;
const area = () => chrome.storage.session ?? chrome.storage.local;
export async function putPendingAction(invocation: ActionInvocation): Promise<void> { await area().set({ [key(invocation.windowId, invocation.tabId)]: invocation }); }
export async function consumePendingAction(windowId: number, tabId: number): Promise<ActionInvocation | undefined> { const id = key(windowId, tabId); const values = await area().get(id); await area().remove(id); return values[id] as ActionInvocation | undefined; }
export async function clearPendingActionsForTab(tabId: number): Promise<void> { const values = await area().get(null); const ids = Object.keys(values).filter(id => id.startsWith(PREFIX) && (values[id] as ActionInvocation)?.tabId === tabId); if (ids.length) await area().remove(ids); }
