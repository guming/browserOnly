import type { ProviderConfig } from '../../background/configManager';
import { anthropicModels, deepseekModels, geminiModels, openaiModels } from '../models';

export type RoutedTask = 'translation' | 'explain' | 'ocr';
export type TaskModelCandidate = {
  provider: ProviderConfig['provider'];
  modelId: string;
  supportsImages: boolean;
  /** `unknown` must never be interpreted as a free model. */
  priceStatus: 'free' | 'priced' | 'unknown';
  inputPrice?: number;
  outputPrice?: number;
};
export type TaskModelAssignment = TaskModelCandidate & { task: RoutedTask; reason: string };

const freeLocalProviders = new Set(['ollama']);

function metadata(provider: string, modelId: string): { supportsImages?: boolean; inputPrice?: number; outputPrice?: number } | undefined {
  if (provider === 'anthropic') return (anthropicModels as any)[modelId];
  if (provider === 'openai') return (openaiModels as any)[modelId];
  if (provider === 'gemini') return (geminiModels as any)[modelId];
  if (provider === 'deepseek') return (deepseekModels as any)[modelId];
  return undefined;
}

/** Builds candidates only from configured providers' currently selected models. */
export function collectTaskModelCandidates(configs: ProviderConfig[]): TaskModelCandidate[] {
  const result: TaskModelCandidate[] = [];
  for (const config of configs) {
    const modelId = config.apiModelId?.trim();
    if (!modelId) continue;
    const info = metadata(config.provider, modelId);
    // Custom providers expose no trustworthy price metadata today, so treat as unknown.
    const knownPrice = Number.isFinite(info?.inputPrice) && Number.isFinite(info?.outputPrice);
    result.push({
      provider: config.provider,
      modelId,
      supportsImages: info?.supportsImages === true,
      priceStatus: freeLocalProviders.has(config.provider) ? 'free' : knownPrice ? 'priced' : 'unknown',
      inputPrice: knownPrice ? info!.inputPrice : undefined,
      outputPrice: knownPrice ? info!.outputPrice : undefined,
    });
  }
  return result;
}

/**
 * Select once per configuration revision. The score represents a small fixed
 * workload (1k input + 300 output tokens), used only to compare candidates.
 */
export function assignTaskModels(candidates: TaskModelCandidate[]): Record<RoutedTask, TaskModelAssignment | undefined> {
  const tasks: RoutedTask[] = ['translation', 'explain', 'ocr'];
  const assignments = {} as Record<RoutedTask, TaskModelAssignment | undefined>;
  for (const task of tasks) {
    const capable = candidates.filter(candidate => task !== 'ocr' || candidate.supportsImages);
    const sorted = [...capable].sort((a, b) => {
      const rank = (candidate: TaskModelCandidate) => candidate.priceStatus === 'free' ? 0 : candidate.priceStatus === 'priced' ? 1 : 2;
      const rankDelta = rank(a) - rank(b);
      if (rankDelta) return rankDelta;
      if (a.priceStatus === 'priced' && b.priceStatus === 'priced') {
        const cost = (candidate: TaskModelCandidate) => candidate.inputPrice! * 1000 + candidate.outputPrice! * 300;
        const costDelta = cost(a) - cost(b);
        if (costDelta) return costDelta;
      }
      return `${a.provider}/${a.modelId}`.localeCompare(`${b.provider}/${b.modelId}`);
    });
    const selected = sorted[0];
    assignments[task] = selected ? {
      ...selected,
      task,
      reason: task === 'ocr' && !selected.supportsImages ? 'No configured image-capable model' : selected.priceStatus === 'free' ? 'Lowest cost: local model' : selected.priceStatus === 'priced' ? 'Lowest known estimated cost' : 'Only available candidate has unknown pricing',
    } : undefined;
  }
  return assignments;
}
