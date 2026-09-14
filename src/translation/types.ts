export type TranslationMode = 'bilingual' | 'translation-only' | 'original';
export type TranslationState = 'idle' | 'queued' | 'translating' | 'translated' | 'skipped' | 'error' | 'cancelled';
export type TranslationEngineName = 'auto' | 'configured-provider' | 'ollama' | 'chrome';

export interface TranslationUnit { sourceId: string; text: string; kind?: 'paragraph' | 'title' | 'selection'; contextHash?: string; }
export interface TranslationRequest { tabId: number; windowId?: number; pageSessionId: string; requestId: string; sourceLanguage?: string; targetLanguage: string; engine: TranslationEngineName; model?: string; style?: 'natural' | 'faithful' | 'explain'; units: TranslationUnit[]; context?: string; }
export interface TranslationResult { sourceId: string; sourceTextHash: string; translatedText: string; state: TranslationState; sourceLanguage?: string; targetLanguage: string; engine: TranslationEngineName; model?: string; cacheVersion: number; error?: string; }
export interface TranslationEngine { readonly name: TranslationEngineName; translate(request: TranslationRequest, signal?: AbortSignal): Promise<TranslationResult[]>; }
export const TRANSLATION_CACHE_VERSION = 1;

export function hashText(text: string): string { let h = 2166136261; for (let i=0;i<text.length;i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
