import { hashText, TRANSLATION_CACHE_VERSION, TranslationResult } from './types';
type CacheEntry = TranslationResult & { key: string; createdAt: number };
const memory = new Map<string, CacheEntry>();
const keyOf = (p: { text: string; sourceLanguage?: string; targetLanguage: string; engine: string; model?: string; style?: string; contextHash?: string }) => [TRANSLATION_CACHE_VERSION, hashText(p.text), p.sourceLanguage || 'auto', p.targetLanguage, p.engine, p.model || '', p.style || 'natural', p.contextHash || ''].join(':');
export const translationCache = {
  keyOf,
  async get(params: Parameters<typeof keyOf>[0]): Promise<TranslationResult | undefined> { const key=keyOf(params); const m=memory.get(key); if(m) return m; try { const r=await chrome.storage.local.get({ translationCache: {} }); return r.translationCache?.[key]; } catch { return undefined; } },
  async set(params: Parameters<typeof keyOf>[0], value: TranslationResult): Promise<void> { const key=keyOf(params); const entry={...value,key,createdAt:Date.now()}; memory.set(key,entry); try { const r=await chrome.storage.local.get({ translationCache: {} }); await chrome.storage.local.set({ translationCache: {...(r.translationCache||{}), [key]: entry} }); } catch { /* cache is best effort */ } },
  async clear(scope?: 'all'|'site'|'page'): Promise<void> { memory.clear(); if(scope==='all' || !scope) { try { await chrome.storage.local.set({translationCache:{}}); } catch {} } },
};
