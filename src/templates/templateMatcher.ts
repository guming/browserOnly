import type { TemplateUsageState, WorkflowTemplate } from './types';
export function matchTemplates(templates: readonly WorkflowTemplate[], options: { query?: string; category?: string; url?: string; pageSignals?: string[]; usage?: Record<string, TemplateUsageState> } = {}): WorkflowTemplate[] {
  const query = options.query?.trim().toLocaleLowerCase() ?? '';
  const hostname = safeHostname(options.url);
  return templates.filter(template => !options.category || options.category === 'all' || options.category === 'page' && hostname && matchesPage(template, options.url ?? '', hostname, options.pageSignals ?? []) || template.category === options.category)
    .filter(template => !query || [template.name, template.description, ...template.tags].some(value => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => score(b, hostname, options.usage) - score(a, hostname, options.usage) || a.name.localeCompare(b.name));
}
function matchesPage(template: WorkflowTemplate, url: string, hostname: string, signals: string[]): boolean { if (!matchesDomain(template, hostname)) return false; if (!template.pageMatchers?.length) return true; return template.pageMatchers.some(matcher => (!matcher.urlPattern || new RegExp(matcher.urlPattern, 'i').test(url)) && (matcher.requiredSignals ?? []).every(signal => signals.includes(signal))); }
function matchesDomain(template: WorkflowTemplate, hostname: string): boolean { return template.triggerDomains.length === 0 || template.triggerDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`)); }
function score(template: WorkflowTemplate, hostname: string, usage: Record<string, TemplateUsageState> = {}): number { return (hostname && matchesDomain(template, hostname) ? 100 : 0) + (usage[template.id]?.useCount ?? 0) * 2 + (usage[template.id]?.lastUsedAt ?? 0) / 1e13; }
function safeHostname(url?: string): string { try { return url ? new URL(url).hostname : ''; } catch { return ''; } }
