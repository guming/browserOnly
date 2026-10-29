import { Ollama } from 'ollama/browser';
import { ConfigManager, ProviderConfig } from '../../background/configManager';
import { DEFAULT_OLLAMA_BASE_URL } from '../providers/ollama';
import { assignTaskModels, collectTaskModelCandidates, RoutedTask, TaskModelAssignment } from './TaskModelRouter';

const STORAGE_KEY = 'taskModelRouting:v2';
type SavedRouting = { fingerprint: string; assignments: Record<RoutedTask, TaskModelAssignment | undefined> };

/** Persisted, configuration-time assignments; calls reuse the same snapshot. */
export class TaskModelRoutingService {
  private static pending?: Promise<SavedRouting>;

  static async getAssignments(forceRefresh = false): Promise<SavedRouting> {
    const manager = ConfigManager.getInstance();
    const names = await manager.getConfiguredProviders() as ProviderConfig['provider'][];
    const configs = await Promise.all(names.map(name => manager.getProviderConfig(name)));
    const fingerprint = JSON.stringify(configs.map(config => [config.provider, config.apiModelId, config.baseUrl, config.openaiCompatibleModels, config.ollamaCustomModels]));
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const current = stored[STORAGE_KEY] as SavedRouting | undefined;
    if (!forceRefresh && current?.fingerprint === fingerprint) return current;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const candidates = collectTaskModelCandidates(configs);
      await Promise.all(candidates.filter(candidate => candidate.provider === 'ollama').map(async candidate => {
        const config = configs.find(item => item.provider === 'ollama' && item.apiModelId === candidate.modelId);
        if (!config) return;
        try {
          const client = new Ollama({ host: config.baseUrl || DEFAULT_OLLAMA_BASE_URL });
          const details = await client.show({ model: candidate.modelId }) as { capabilities?: string[]; projector_info?: unknown };
          candidate.supportsImages = Array.isArray(details.capabilities)
            ? details.capabilities.includes('vision')
            : Boolean(details.projector_info);
        } catch {
          // A model whose capabilities cannot be verified is excluded from OCR.
          candidate.supportsImages = false;
        }
      }));
      const assignments = assignTaskModels(candidates);
      const next = { fingerprint, assignments };
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
      return next;
    })();
    try { return await this.pending; } finally { this.pending = undefined; }
  }

  static async getAssignment(task: RoutedTask): Promise<TaskModelAssignment | undefined> {
    return (await this.getAssignments()).assignments[task];
  }
}
