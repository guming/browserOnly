import { valueText } from './normalizers';
import type { MonitorDiff, MonitorSnapshot } from './types';

const bound = (items: string[]) => {
  const result: string[] = [];
  let size = 0;
  for (const item of items.slice(0, 100)) {
    if (size + item.length > 20_000) break;
    result.push(item); size += item.length;
  }
  return result;
};

export function localizedChange(before: string, after: string): { removed: string[]; added: string[]; ratio: number } | undefined {
  if (!before || !after || before === after) return undefined;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) { beforeEnd--; afterEnd--; }
  const changedCharacters = beforeEnd - start + afterEnd - start;
  // Keep a changed number together rather than showing only its last digit.
  while (start > 0 && /\d/.test(before[start - 1]) && /\d/.test(after[start - 1])) start--;
  while (beforeEnd < before.length && afterEnd < after.length && /\d/.test(before[beforeEnd]) && /\d/.test(after[afterEnd])) { beforeEnd++; afterEnd++; }
  const removed = before.slice(start, beforeEnd).trim();
  const added = after.slice(start, afterEnd).trim();
  if (Math.max(removed.length, added.length) > 120) return undefined;
  return { removed: removed ? [removed] : [], added: added ? [added] : [], ratio: changedCharacters / Math.max(1, before.length + after.length) };
}

export function createDiff(previous: MonitorSnapshot, current: MonitorSnapshot): MonitorDiff {
  const before = valueText(previous.normalizedValue);
  const after = valueText(current.normalizedValue);
  const changed = previous.contentHash !== current.contentHash;
  const beforeTokens = new Set(before.split(/\s+/).filter(Boolean));
  const afterTokens = new Set(after.split(/\s+/).filter(Boolean));
  const previousPrice = previous.normalizedValue.type === 'price' ? previous.normalizedValue : undefined;
  const currentPrice = current.normalizedValue.type === 'price' ? current.normalizedValue : undefined;
  const previousStock = previous.normalizedValue.type === 'stock' ? previous.normalizedValue : undefined;
  const currentStock = current.normalizedValue.type === 'stock' ? current.normalizedValue : undefined;
  const priceValues = !!previousPrice && !!currentPrice;
  const stockValues = !!previousStock && !!currentStock;
  const numericDelta = previousPrice && currentPrice ? currentPrice.amount - previousPrice.amount : undefined;
  const comparableStockChange = !!previousStock && !!currentStock && previousStock.state !== 'unknown' && currentStock.state !== 'unknown';
  const effectiveChanged = previousStock && currentStock ? comparableStockChange && previousStock.state !== currentStock.state : changed;
  const pageText = current.kind === 'page_text';
  const changedTokenCount = [...afterTokens].filter(item => !beforeTokens.has(item)).length + [...beforeTokens].filter(item => !afterTokens.has(item)).length;
  const changeRatio = changedTokenCount / Math.max(1, beforeTokens.size + afterTokens.size);
  const local = pageText && effectiveChanged ? localizedChange(before, after) : undefined;
  return {
    id: `diff-${crypto.randomUUID()}`, monitorId: current.monitorId, runId: current.runId,
    previousSnapshotId: previous.id, currentSnapshotId: current.id, changed: effectiveChanged,
    changeType: !effectiveChanged ? 'unchanged' : priceValues ? (numericDelta! > 0 ? 'increase' : 'decrease') : stockValues ? 'stock_changed' : !before ? 'appeared' : !after ? 'disappeared' : 'text_changed',
    previousValue: previous.normalizedValue, currentValue: current.normalizedValue,
    numericDelta,
    percentDelta: previousPrice && currentPrice && previousPrice.amount !== 0 ? numericDelta! / previousPrice.amount * 100 : undefined,
    addedText: effectiveChanged && !priceValues && !stockValues ? local?.added ?? bound([...afterTokens].filter(item => !beforeTokens.has(item))) : [],
    removedText: effectiveChanged && !priceValues && !stockValues ? local?.removed ?? bound([...beforeTokens].filter(item => !afterTokens.has(item))) : [],
    significance: !effectiveChanged ? 'none' : pageText && (local ? local.ratio < 0.02 : changeRatio < 0.01) ? 'low' : 'high', createdAt: current.observedAt,
  };
}
