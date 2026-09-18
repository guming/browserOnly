import type { ActionDefinition } from './types';

export const builtInActions: readonly ActionDefinition[] = [
  { id: 'summarize', kind: 'built_in', slashCommand: '/summarize', name: 'Summarize current page', description: 'Summarize the current page or selection', keywords: ['summary', 'page', 'selection'], runBehavior: 'direct', supportedContexts: ['page', 'selection'] },
  { id: 'translate', kind: 'built_in', slashCommand: '/translate', name: 'Translate current page', description: 'Translate the current page or selection', keywords: ['translation', 'language'], runBehavior: 'direct', supportedContexts: ['page', 'selection'] },
  { id: 'extract', kind: 'built_in', slashCommand: '/extract', name: 'Extract structured data', description: 'Extract fields into a table, CSV, or JSON', keywords: ['data', 'table', 'csv', 'json'], runBehavior: 'configure', supportedContexts: ['page', 'selection', 'tabs'] },
  { id: 'compare', kind: 'built_in', slashCommand: '/compare', name: 'Compare selected tabs', description: 'Compare content across browser tabs', keywords: ['research', 'tabs', 'differences'], runBehavior: 'configure', supportedContexts: ['tabs'] },
];
