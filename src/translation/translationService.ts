import { ConfigManager } from '../background/configManager';
import { createProvider } from '../models/providers/factory';
import { translationCache } from './translationCache';
import { mapProviderTranslations, ProviderTranslationItem } from './translationMapping';
import { TranslationEngineName, TranslationRequest, TranslationResult, hashText } from './types';
import { TaskModelRoutingService } from '../models/routing/TaskModelRoutingService';

export async function translateBatch(request: TranslationRequest, signal?: AbortSignal): Promise<TranslationResult[]> {
  const configManager=ConfigManager.getInstance();
  const primaryConfig=await configManager.getProviderConfig();
  const preferred=request.engine==='auto' ? (primaryConfig.translationProvider==='ollama'?'ollama':'configured-provider') : request.engine;
  if(preferred==='chrome') throw new Error('Chrome Translator API is not available in background yet');
  const automatic = request.engine === 'auto' && (!primaryConfig.translationProvider || primaryConfig.translationProvider === 'auto');
  const assignment = automatic ? await TaskModelRoutingService.getAssignment('translation') : undefined;
  if (automatic && !assignment) throw new Error('Automatic translation has no eligible configured model. Select a provider or configure a supported model.');
  const providerName=assignment?.provider ?? (preferred==='ollama'?'ollama':(primaryConfig.translationProvider && primaryConfig.translationProvider!=='primary' && primaryConfig.translationProvider!=='auto'?primaryConfig.translationProvider:primaryConfig.provider));
  const config=providerName===primaryConfig.provider ? primaryConfig : await configManager.getProviderConfig(providerName);
  if (assignment) config.apiModelId = assignment.modelId;
  const engine: TranslationEngineName=providerName==='ollama'?'ollama':'configured-provider';
  const cacheModel = `${providerName}:${config.apiModelId || ''}`;
  const results: TranslationResult[]=[]; const misses=[];
  for(const unit of request.units){ const cached=await translationCache.get({text:unit.text,sourceLanguage:request.sourceLanguage,targetLanguage:request.targetLanguage,engine,model:cacheModel,style:request.style,contextHash:unit.contextHash}); if(cached) results.push(cached); else misses.push(unit); }
  console.info('[translation][service] batch prepared', { pageSessionId:request.pageSessionId, requestId:request.requestId, provider:providerName, model:config.apiModelId, targetLanguage:request.targetLanguage, requested:request.units.length, cacheHits:results.length, misses:misses.length });
  if(!misses.length) return results;
  const provider=await createProvider(providerName as any,{apiKey:config.apiKey,apiModelId:config.apiModelId,baseUrl:config.baseUrl,thinkingBudgetTokens:0,dangerouslyAllowBrowser:true} as any);
  const system=`Translate each input into ${request.targetLanguage}. Return ONLY a JSON array of objects [{"sourceId":"1","translation":"..."}] preserving the short numeric sourceId exactly. Style: ${request.style||'natural'}. ${request.context||''}`;
  if(signal?.aborted) throw new Error('aborted');
  const input=JSON.stringify(misses.map((unit,index)=>({sourceId:String(index+1),text:unit.text})));
  const parseTranslationResponse = (text: string): ProviderTranslationItem[] => {
    let json = text.trim();
    const fenced = json.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) json = fenced[1].trim();
    const decoded: unknown = JSON.parse(json);
    if (!Array.isArray(decoded) || decoded.some(item => !item || typeof item !== 'object' ||
      !('sourceId' in item) || !('translation' in item) || typeof item.translation !== 'string' || !item.translation.trim())) {
      throw new Error('Translation response must be an array of items with sourceId and non-empty translation');
    }
    return decoded as ProviderTranslationItem[];
  };
  let parsed: ProviderTranslationItem[] | undefined;
  let parseError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) throw new Error('aborted');
    let text = '';
    const requestSystem = attempt === 0 ? system : `${system} Your previous response was invalid. Return only a valid JSON array; ensure every item has a sourceId and non-empty translation.`;
    for await (const chunk of provider.createMessage(requestSystem,[{role:'user',content:input}],[])) {
      if (chunk.type === 'text') text += chunk.text || '';
      if (signal?.aborted) throw new Error('aborted');
    }
    console.info('[translation][service] provider response received', { pageSessionId:request.pageSessionId, requestId:request.requestId, chars:text.length, attempt:attempt + 1 });
    try {
      parsed = parseTranslationResponse(text);
      break;
    } catch (error) {
      parseError = error;
      console.error('[translation][service] response parse failed', { pageSessionId:request.pageSessionId, requestId:request.requestId, chars:text.length, attempt:attempt + 1 });
    }
  }
  if (!parsed) throw new Error(`Malformed translation response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  console.info('[translation][service] response parsed', { pageSessionId:request.pageSessionId, requestId:request.requestId, items:parsed.length });
  const translations=mapProviderTranslations(misses,parsed);
  for(const unit of misses){ const translatedText=translations.get(unit.sourceId); if(!translatedText) continue; const result:TranslationResult={sourceId:unit.sourceId,sourceTextHash:hashText(unit.text),translatedText,state:'translated',sourceLanguage:request.sourceLanguage,targetLanguage:request.targetLanguage,engine,model:config.apiModelId,cacheVersion:1}; results.push(result); await translationCache.set({text:unit.text,sourceLanguage:request.sourceLanguage,targetLanguage:request.targetLanguage,engine,model:cacheModel,style:request.style,contextHash:unit.contextHash},result); }
  console.info('[translation][service] batch results built', { pageSessionId:request.pageSessionId, requestId:request.requestId, results:results.length, requested:request.units.length });
  return results;
}
