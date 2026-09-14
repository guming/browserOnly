import { ConfigManager } from '../background/configManager';
import { createProvider } from '../models/providers/factory';
import { translationCache } from './translationCache';
import { mapProviderTranslations, ProviderTranslationItem } from './translationMapping';
import { TranslationEngineName, TranslationRequest, TranslationResult, hashText } from './types';

export async function translateBatch(request: TranslationRequest, signal?: AbortSignal): Promise<TranslationResult[]> {
  const configManager=ConfigManager.getInstance();
  const primaryConfig=await configManager.getProviderConfig();
  const preferred=request.engine==='auto' ? (primaryConfig.translationProvider==='ollama'?'ollama':'configured-provider') : request.engine;
  if(preferred==='chrome') throw new Error('Chrome Translator API is not available in background yet');
  const providerName=preferred==='ollama'?'ollama':(primaryConfig.translationProvider && primaryConfig.translationProvider!=='primary'?primaryConfig.translationProvider:primaryConfig.provider);
  const config=providerName===primaryConfig.provider ? primaryConfig : await configManager.getProviderConfig(providerName);
  const engine: TranslationEngineName=providerName==='ollama'?'ollama':'configured-provider';
  const results: TranslationResult[]=[]; const misses=[];
  for(const unit of request.units){ const cached=await translationCache.get({text:unit.text,sourceLanguage:request.sourceLanguage,targetLanguage:request.targetLanguage,engine,model:config.apiModelId,style:request.style,contextHash:unit.contextHash}); if(cached) results.push(cached); else misses.push(unit); }
  console.info('[translation][service] batch prepared', { pageSessionId:request.pageSessionId, requestId:request.requestId, provider:providerName, model:config.apiModelId, targetLanguage:request.targetLanguage, requested:request.units.length, cacheHits:results.length, misses:misses.length });
  if(!misses.length) return results;
  const provider=await createProvider(providerName as any,{apiKey:config.apiKey,apiModelId:config.apiModelId,baseUrl:config.baseUrl,thinkingBudgetTokens:0,dangerouslyAllowBrowser:true} as any);
  const system=`Translate each input into ${request.targetLanguage}. Return ONLY a JSON array of objects [{"sourceId":"1","translation":"..."}] preserving the short numeric sourceId exactly. Style: ${request.style||'natural'}. ${request.context||''}`;
  if(signal?.aborted) throw new Error('aborted');
  const input=JSON.stringify(misses.map((unit,index)=>({sourceId:String(index+1),text:unit.text})));
  let text=''; for await(const chunk of provider.createMessage(system,[{role:'user',content:input}],[])){ if(chunk.type==='text') text+=chunk.text||''; if(signal?.aborted) throw new Error('aborted'); }
  console.info('[translation][service] provider response received', { pageSessionId:request.pageSessionId, requestId:request.requestId, chars:text.length });
  let parsed:ProviderTranslationItem[]; try { parsed=JSON.parse(text.replace(/^```json\s*|```$/g,'').trim()); } catch { console.error('[translation][service] response parse failed', { pageSessionId:request.pageSessionId, requestId:request.requestId, chars:text.length }); throw new Error('Malformed translation response'); }
  console.info('[translation][service] response parsed', { pageSessionId:request.pageSessionId, requestId:request.requestId, items:parsed.length });
  const translations=mapProviderTranslations(misses,parsed);
  for(const unit of misses){ const translatedText=translations.get(unit.sourceId); if(!translatedText) continue; const result:TranslationResult={sourceId:unit.sourceId,sourceTextHash:hashText(unit.text),translatedText,state:'translated',sourceLanguage:request.sourceLanguage,targetLanguage:request.targetLanguage,engine,model:config.apiModelId,cacheVersion:1}; results.push(result); await translationCache.set({text:unit.text,sourceLanguage:request.sourceLanguage,targetLanguage:request.targetLanguage,engine,model:config.apiModelId,style:request.style,contextHash:unit.contextHash},result); }
  console.info('[translation][service] batch results built', { pageSessionId:request.pageSessionId, requestId:request.requestId, results:results.length, requested:request.units.length });
  return results;
}
