import { builtInActions } from './builtInActions';
import type { ActionDefinition, ActionSearchContext } from './types';

export class ActionRegistry {
  private readonly actions = new Map<string, ActionDefinition>();
  constructor(actions: readonly ActionDefinition[] = builtInActions) { actions.forEach(action => this.register(action)); }
  register(action: ActionDefinition): void { this.actions.set(action.id, { ...action, keywords: [...action.keywords], supportedContexts: [...action.supportedContexts] }); }
  get(id: string): ActionDefinition | undefined { return this.actions.get(id); }
  list(): ActionDefinition[] { return [...this.actions.values()]; }
  unregister(id: string): void { this.actions.delete(id); }
  isAvailable(action: ActionDefinition, context: ActionSearchContext = {}): boolean { return isAvailable(action, context); }
  search(query: string, context: ActionSearchContext = {}): ActionDefinition[] {
    const needle = query.trim().toLocaleLowerCase().replace(/^\//, '');
    return this.list().filter(action => isAvailable(action, context)).map(action => ({ action, score: score(action, needle) }))
      .filter(item => !needle || item.score > 0).sort((a, b) => b.score - a.score || a.action.name.localeCompare(b.action.name)).map(item => item.action);
  }
}

function isAvailable(action: ActionDefinition, context: ActionSearchContext): boolean {
  const contextMatches = action.supportedContexts.some(kind => kind === 'page' ? context.hasPage !== false : kind === 'selection' ? !!context.hasSelection : (context.comparableTabCount ?? 0) >= 2);
  if (!contextMatches || !action.triggerDomains?.length || !context.pageUrl) return contextMatches;
  try { const host = new URL(context.pageUrl).hostname; return action.triggerDomains.some(domain => host === domain || host.endsWith(`.${domain}`)); } catch { return false; }
}
function score(action: ActionDefinition, query: string): number {
  if (!query) return (action.kind === 'built_in' ? 10 : 1) + (action.useCount ?? 0) * 2 + (action.lastUsedAt ?? 0) / 1e13;
  const command = action.slashCommand.slice(1).toLocaleLowerCase();
  const name = action.name.toLocaleLowerCase();
  if (command === query) return 100;
  if (command.startsWith(query)) return 80;
  if (name.includes(query)) return 50;
  if (action.keywords.some(keyword => keyword.toLocaleLowerCase().includes(query))) return 30;
  return 0;
}
