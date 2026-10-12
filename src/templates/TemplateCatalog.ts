import { z } from 'zod';
import { templateCatalog } from './catalog';
import { matchTemplates } from './templateMatcher';
import type { TemplateUsageState, WorkflowTemplate } from './types';

const variableSchema = z.object({ key: z.string().min(1), label: z.string().min(1), type: z.enum(['string', 'number', 'date', 'boolean', 'secret', 'enum', 'url', 'tab', 'tabs', 'fields']), required: z.boolean(), defaultValue: z.unknown().optional(), description: z.string().optional(), placeholder: z.string().optional(), options: z.array(z.object({ label: z.string(), value: z.string() })).optional(), validation: z.object({ min: z.number().optional(), max: z.number().optional(), maxLength: z.number().optional(), pattern: z.string().optional() }).optional() });
const templateSchema = z.object({ id: z.string().min(1), schemaVersion: z.literal(1), name: z.string().min(1), description: z.string().min(1), category: z.enum(['page', 'research', 'shopping', 'productivity', 'data', 'writing']), tags: z.array(z.string()), triggerDomains: z.array(z.string()), pageMatchers: z.array(z.object({ urlPattern: z.string().optional(), requiredSignals: z.array(z.string()).optional() })).optional(), risk: z.enum(['read', 'write', 'irreversible']), executionMode: z.enum(['new_tab', 'current_tab']), variables: z.array(variableSchema), version: z.object({ steps: z.array(z.any()).min(1), finalAssertions: z.array(z.any()) }), output: z.object({ type: z.enum(['markdown', 'table', 'json', 'download']), title: z.string().optional(), downloadableFormats: z.array(z.enum(['csv', 'json'])).optional() }).optional() });
export class TemplateCatalog {
  private readonly templates: WorkflowTemplate[];
  constructor(input: readonly WorkflowTemplate[] = templateCatalog) { const ids = new Set<string>(); this.templates = input.map(value => { const parsed = templateSchema.parse(value) as WorkflowTemplate; if (ids.has(parsed.id)) throw new Error(`Duplicate template id: ${parsed.id}`); ids.add(parsed.id); return clone(parsed); }); }
  list(): WorkflowTemplate[] { return clone(this.templates); }
  get(id: string): WorkflowTemplate | undefined { const found = this.templates.find(item => item.id === id); return found ? clone(found) : undefined; }
  search(options: { query?: string; category?: string; url?: string; pageSignals?: string[]; usage?: Record<string, TemplateUsageState> } = {}): WorkflowTemplate[] { return matchTemplates(this.list(), options); }
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
