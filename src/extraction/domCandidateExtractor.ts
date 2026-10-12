import type { ExtractionPlan } from './types';

export interface DomCandidate { text: string; sourceUrl?: string; selector?: string; kind?: ExtractionPlan['sourceKind']; }

export function extractDomCandidates(html: string, sourceUrl?: string): DomCandidate[] {
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(html, 'text/html');
    for (const candidate of candidateSelectors) {
      const nodes = Array.from(document.querySelectorAll(candidate.selector));
      if (nodes.length < 2 && candidate.kind !== 'table') continue;
      const rows = candidate.kind === 'table' ? Array.from(document.querySelectorAll('table tr')).slice(1) : nodes;
      const result = rows.map(node => ({ text: clean(node.textContent), sourceUrl, selector: candidate.selector, kind: candidate.kind })).filter(item => item.text);
      if (result.length >= 2) return result;
    }
    const text = clean(document.body?.textContent);
    return text ? [{ text, sourceUrl }] : [];
  }
  const tableRows = html.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
  const rows = tableRows.map(row => ({ text: clean(row.replace(/<[^>]+>/g, ' ')), sourceUrl, selector: 'table tr', kind: 'table' as const })).filter(item => item.text);
  if (rows.length >= 2) return rows.slice(1);
  const text = clean(html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' '));
  return text ? [{ text, sourceUrl }] : [];
}

export function planFromCandidates(candidates: DomCandidate[], fields: ExtractionPlan['fields'], maxRows = 100): ExtractionPlan {
  const repeated = candidates.filter(candidate => candidate.selector && candidate.kind);
  if (repeated.length < 2) throw new Error('At least two structurally similar records are required');
  return { version: 1, sourceKind: repeated[0].kind!, listSelector: repeated[0].kind === 'table' ? 'table' : repeated[0].selector!, itemSelector: repeated[0].selector, fields, maxPages: 1, maxRows: Math.min(100, Math.max(1, maxRows)) };
}

const candidateSelectors: Array<{ selector: string; kind: ExtractionPlan['sourceKind'] }> = [
  { selector: 'table', kind: 'table' },
  { selector: '[role="grid"] [role="row"]', kind: 'list' },
  { selector: '[role="list"] > [role="listitem"]', kind: 'list' },
  { selector: 'ul > li', kind: 'list' },
  { selector: 'ol > li', kind: 'list' },
  { selector: 'main article', kind: 'repeated-block' },
  { selector: '[class*="card"]', kind: 'repeated-block' },
];
function clean(value?: string | null): string { return (value ?? '').replace(/\s+/g, ' ').trim(); }
