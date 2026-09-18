export type ActionKind = 'built_in' | 'workflow' | 'template';
export type ActionRunBehavior = 'direct' | 'configure' | 'confirm';
export type ActionContextType = 'page' | 'selection' | 'tabs';
export type ActionSource = 'template_library' | 'slash_menu' | 'context_menu' | 'page_actions';

export interface ActionDefinition {
  id: string;
  kind: ActionKind;
  slashCommand: string;
  name: string;
  description: string;
  keywords: string[];
  runBehavior: ActionRunBehavior;
  supportedContexts: ActionContextType[];
  workflowId?: string;
  templateId?: string;
}

export interface ActionSearchContext {
  hasPage?: boolean;
  hasSelection?: boolean;
  comparableTabCount?: number;
}

export interface ActionInvocation {
  actionId: string;
  source: ActionSource;
  tabId: number;
  windowId: number;
  pageUrl?: string;
  pageTitle?: string;
  selectionText?: string;
  instruction?: string;
  presetValues?: Record<string, unknown>;
}

export interface ActionResult {
  actionId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  output?: unknown;
  error?: string;
  runId?: string;
}
