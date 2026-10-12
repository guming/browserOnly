import type { ActionInvocation, ActionResolution } from './types';
import { ActionRegistry } from './actionRegistry';

/** Resolves every UI entry point without performing browser work. */
export class ActionResolver {
  constructor(private readonly registry: ActionRegistry) {}

  resolve(invocation: ActionInvocation): ActionResolution {
    const definition = this.registry.get(invocation.actionId);
    if (!definition) throw new Error(`Unknown action: ${invocation.actionId}`);
    if (!this.registry.isAvailable(definition, {
      hasPage: Boolean(invocation.pageUrl),
      hasSelection: Boolean(invocation.selectionText),
      comparableTabCount: Array.isArray(invocation.presetValues?.tabs) ? invocation.presetValues.tabs.length : undefined,
      pageUrl: invocation.pageUrl,
    })) throw new Error(`${definition.name} is unavailable in the current page context`);
    return { type: definition.runBehavior, definition, invocation } as ActionResolution;
  }
}
