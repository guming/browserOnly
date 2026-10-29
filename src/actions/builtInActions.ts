import type { ActionDefinition } from './types';

export const builtInActions: readonly ActionDefinition[] = [
  { id: 'summarize', kind: 'built_in', slashCommand: '/summarize', name: 'Summarize current page', description: 'Summarize the current page or selection', keywords: ['summary', 'page', 'selection'], runBehavior: 'direct', supportedContexts: ['page', 'selection'] },
  { id: 'explain', kind: 'built_in', slashCommand: '/explain', name: 'Explain selection', description: 'Explain the selected text in plain language', keywords: ['explanation', 'meaning', 'selection'], runBehavior: 'direct', supportedContexts: ['selection'] },
  { id: 'translate', kind: 'built_in', slashCommand: '/translate', name: 'Translate current page', description: 'Translate the current page or selection', keywords: ['translation', 'language'], runBehavior: 'direct', supportedContexts: ['page', 'selection'] },
  { id: 'extract', kind: 'built_in', slashCommand: '/extract', name: 'Extract from page', description: 'Describe what to extract, or send empty to convert the whole page to Markdown', keywords: ['data', 'table', 'csv', 'json', 'markdown', 'page'], runBehavior: 'confirm', supportedContexts: ['page', 'selection', 'tabs'] },
  { id: 'extract-urls', kind: 'built_in', slashCommand: '/url', name: 'Extract page URLs', description: 'List unique links from the current page', keywords: ['url', 'urls', 'links', 'extract links'], runBehavior: 'direct', supportedContexts: ['page'] },
  { id: 'extract-table', kind: 'built_in', slashCommand: '/extract-table', name: 'Extract table or list', description: 'Extract tables, lists or cards using a natural-language request', keywords: ['extract table', 'list', 'cards', 'rows'], runBehavior: 'configure', supportedContexts: ['page'] },
  { id: 'compare', kind: 'built_in', slashCommand: '/compare', name: 'Compare selected tabs', description: 'Compare content across browser tabs', keywords: ['research', 'tabs', 'differences'], runBehavior: 'configure', supportedContexts: ['tabs'] },
  { id: 'workflow-picker', kind: 'built_in', slashCommand: '/workflow', name: 'Run a workflow', description: 'Choose a workflow for the current page', keywords: ['automation', 'workflow'], runBehavior: 'configure', supportedContexts: ['page', 'selection'] },
];
