import type { TemplateUsageState } from './types';
const KEY = 'browserOnlyTemplateUsage';
export async function readTemplateUsage(): Promise<Record<string, TemplateUsageState>> { return (await chrome.storage.local.get({ [KEY]: {} }))[KEY] ?? {}; }
export async function markTemplateUsed(templateId: string): Promise<void> { const all = await readTemplateUsage(); const previous = all[templateId]; all[templateId] = { templateId, useCount: (previous?.useCount ?? 0) + 1, lastUsedAt: Date.now() }; await chrome.storage.local.set({ [KEY]: all }); }
