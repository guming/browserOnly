import { z } from 'zod';
import { templateCatalog } from './catalog';
import { matchTemplates } from './templateMatcher';
import type { TemplateUsageState, WorkflowTemplate } from './types';

const templateSchema = z.object({ id: z.string().min(1), schemaVersion: z.literal(1), name: z.string().min(1), description: z.string().min(1), category: z.enum(['page', 'research', 'shopping', 'productivity', 'data', 'writing']), tags: z.array(z.string()), triggerDomains: z.array(z.string()), risk: z.enum(['read', 'write', 'irreversible']), executionMode: z.enum(['new_tab', 'current_tab']), variables: z.array(z.any()), version: z.object({ steps: z.array(z.any()).min(1), finalAssertions: z.array(z.any()) }) });
export class TemplateCatalog {
  private readonly templates: WorkflowTemplate[];
  constructor(input: readonly WorkflowTemplate[] = templateCatalog) { const ids = new Set<string>(); this.templates = input.map(value => { const parsed = templateSchema.parse(value) as WorkflowTemplate; if (ids.has(parsed.id)) throw new Error(`Duplicate template id: ${parsed.id}`); ids.add(parsed.id); return clone(parsed); }); }
  list(): WorkflowTemplate[] { return clone(this.templates); }
  get(id: string): WorkflowTemplate | undefined { const found = this.templates.find(item => item.id === id); return found ? clone(found) : undefined; }
  search(options: { query?: string; category?: string; url?: string; usage?: Record<string, TemplateUsageState> } = {}): WorkflowTemplate[] { return matchTemplates(this.list(), options); }
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
