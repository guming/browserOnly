import type { ExtractionRequest } from './types';
import type { OfficeTable } from '../office/types';

/** Build a bounded extraction request from a visible repeated collection. */
export function autoRecordRequest(collections: OfficeTable[]): ExtractionRequest {
  const ranked = collections.filter(item => item.recordCount >= 2).sort((a, b) => {
    const priority = { table: 0, list: 1, 'repeated-block': 2 };
    return priority[a.sourceKind] - priority[b.sourceKind] || b.recordCount - a.recordCount;
  });
  const collection = ranked[0];
  if (!collection) throw new Error('No repeated table, list, or cards found on the current page. Open a page with visible records and try again.');
  const labels = collection.sourceKind === 'table' ? collection.headers : ['Record'];
  const seen = new Set<string>();
  const fields = labels.map((label, index) => {
    const base = label.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^A-Za-z]+/, '') || `column${index + 1}`;
    let key = base;
    for (let suffix = 2; seen.has(key); suffix++) key = `${base}${suffix}`;
    seen.add(key);
    return { key, label: label.trim() || `Column ${index + 1}`, type: 'text' as const };
  });
  const itemSelector = collection.sourceKind === 'table'
    ? `${collection.selector} tr:not(:has(th))`
    : collection.selector;
  return {
    source: 'page', fields, maxRows: 100, outputFormat: 'table',
    plan: {
      version: 1, sourceKind: collection.sourceKind,
      listSelector: collection.selector, itemSelector,
      fields: fields.map((field, index) => ({ name: field.key, column: index })),
      maxPages: 1, maxRows: 100,
    },
  };
}
