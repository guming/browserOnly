import { DynamicTool } from 'langchain/tools';
import type { ToolFactory } from './types';
import { withActivePage, retryAfterNavigation } from './utils';

interface Field { selector?: string; source: 'text' | 'attribute'; attribute?: string }
interface ReadInput { selector: string; fields: Record<string, Field>; limit: number; offset: number }

/** Self-contained for serialization into the page; never evaluates user code. */
export function extractFieldsFromDom(input: ReadInput) {
  const containers = Array.from(document.querySelectorAll(input.selector));
  // Validate relative selectors even when the page contains no records.
  for (const field of Object.values(input.fields)) if (field.selector) document.createElement('div').querySelector(field.selector);
  const fieldBudget = Math.min(1000, Math.floor((16000 - 2 * JSON.stringify(Object.keys(input.fields)).length) / Object.keys(input.fields).length));
  const data: Record<string, string | null>[] = [];
  const truncatedFields: Array<{ index: number; fields: string[] }> = [];
  for (let index = input.offset; index < Math.min(containers.length, input.offset + input.limit); index++) {
    const row: Record<string, string | null> = Object.create(null);
    const clipped: string[] = [];
    for (const [name, field] of Object.entries(input.fields)) {
      const node = field.selector ? containers[index].querySelector(field.selector) : containers[index];
      let value = node ? field.source === 'text' ? (node.textContent || '').replace(/\s+/g, ' ').trim() : node.getAttribute(field.attribute!) : null;
      if (value !== null && field.source === 'attribute' && field.attribute?.toLowerCase() === 'href') {
        try { const url = new URL(value, document.baseURI); value = /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null; } catch { value = null; }
      }
      if (value !== null && (value.length > 1000 || JSON.stringify(value).length > fieldBudget)) {
        value = value.slice(0, 1000);
        while (JSON.stringify(value).length > fieldBudget) value = value.slice(0, Math.max(0, value.length - Math.ceil((JSON.stringify(value).length - fieldBudget) / 6)));
        clipped.push(name);
      }
      row[name] = value;
    }
    const candidateFields = clipped.length ? [...truncatedFields, { index, fields: clipped }] : truncatedFields;
    const candidate = { ok: true, data: [...data, row], meta: { returnedCount: data.length + 1, totalCount: containers.length, truncated: true, nextOffset: index + 1, scope: 'current_dom', truncatedFields: candidateFields } };
    if (JSON.stringify(candidate).length > 19800) break;
    data.push(row);
    if (clipped.length) truncatedFields.push({ index, fields: clipped });
  }
  const next = input.offset + data.length;
  return { ok: true, data, meta: { returnedCount: data.length, totalCount: containers.length, truncated: next < containers.length || truncatedFields.length > 0, nextOffset: next < containers.length ? next : null, scope: 'current_dom', truncatedFields } };
}

export const browserExtractFields: ToolFactory = page => new DynamicTool({
  name: 'browser_extract_fields',
  description: 'Extract repeated records as structured fields from the current DOM. JSON input: {selector, fields: {name: {selector?: relative CSS, source: "text"|"attribute", attribute?: string}}, limit?: 1..200 (default 50), offset?: nonnegative integer}. Missing fields are null; href is resolved to HTTP(S). Output declares truncation and nextOffset. Does not load more pages.',
  func: async (raw: string) => {
    let input: ReadInput;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.selector !== 'string' || !parsed.selector.trim() || !parsed.fields || typeof parsed.fields !== 'object' || Array.isArray(parsed.fields)) throw new Error('selector and fields are required');
      const entries = Object.entries(parsed.fields);
      if (!entries.length || entries.length > 20 || entries.some(([name]) => JSON.stringify(name).length > 100)) throw new Error('Provide 1..20 fields with names up to 100 characters');
      for (const [, value] of entries) {
        const field = value as Field;
        if (!field || !['text', 'attribute'].includes(field.source) || (field.selector !== undefined && typeof field.selector !== 'string') || (field.source === 'attribute' && (typeof field.attribute !== 'string' || !field.attribute))) throw new Error('Invalid field descriptor');
      }
      input = { selector: parsed.selector, fields: parsed.fields, limit: parsed.limit ?? 50, offset: parsed.offset ?? 0 };
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 200 || !Number.isSafeInteger(input.offset) || input.offset < 0) throw new Error('Invalid limit or offset');
    } catch (error) { return JSON.stringify({ ok: false, error: { code: 'INVALID_ARGUMENT', message: String(error), repairable: true } }); }
    try {
      return await withActivePage(page, async active => JSON.stringify(await retryAfterNavigation(active, () => active.evaluate(extractFieldsFromDom, input))));
    } catch (error) { return JSON.stringify({ ok: false, error: { code: error instanceof Error && error.name === 'SyntaxError' ? 'INVALID_ARGUMENT' : 'PAGE_UNAVAILABLE', message: String(error), repairable: true } }); }
  },
});
