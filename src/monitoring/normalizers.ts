import type { NormalizedMonitorValue } from './types';

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

export function normalizeText(value: string, maxLength = 20_000): Extract<NormalizedMonitorValue, { type: 'text' }> {
  const text = value.normalize('NFC').replace(/\u00a0/g, ' ').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  return { type: 'text', text };
}

export function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function valueText(value: NormalizedMonitorValue): string {
  if (value.type === 'text') return value.text;
  if (value.type === 'price') return `${value.currency ?? ''}${value.amount}`;
  return value.state;
}

const CURRENCIES: Array<[RegExp, string]> = [
  [/(?:CNY|RMB|CN¥|￥|¥)/i, 'CNY'], [/(?:USD|US\$|\$)/i, 'USD'],
  [/(?:EUR|€)/i, 'EUR'], [/(?:GBP|£)/i, 'GBP'], [/(?:JPY|JP¥)/i, 'JPY'],
  [/(?:KRW|₩)/i, 'KRW'],
];

export function normalizePrice(raw: string): Extract<NormalizedMonitorValue, { type: 'price' }> {
  const text = raw.normalize('NFC').replace(/\u00a0/g, ' ').trim();
  const currency = CURRENCIES.find(([pattern]) => pattern.test(text))?.[1];
  const tokens = text.match(/\d[\d.,\s]*/g)?.map(parseLocalizedNumber).filter((value): value is number => Number.isFinite(value)) ?? [];
  if (!tokens.length) throw new Error('PARSE_FAILED: no numeric price found');
  const range = /[-–—~至到]/.test(text) && tokens.length > 1;
  const qualifier = range ? 'range' : /\bfrom\b|\bstarting\b|起|起价/i.test(text) ? 'from' : 'exact';
  return { type: 'price', amount: range ? Math.min(...tokens) : tokens[0], currency, qualifier };
}

function parseLocalizedNumber(token: string): number {
  let value = token.replace(/\s/g, '');
  const dot = value.lastIndexOf('.'); const comma = value.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? '.' : ','; const thousands = decimal === '.' ? /,/g : /\./g;
    value = value.replace(thousands, '').replace(decimal, '.');
  } else if (comma >= 0) {
    const digits = value.length - comma - 1; value = digits === 2 ? value.replace(',', '.') : value.replace(/,/g, '');
  } else if (dot >= 0) {
    const digits = value.length - dot - 1; if (digits !== 2) value = value.replace(/\./g, '');
  }
  return Number(value);
}

export function normalizeStock(found: boolean, evidence: string, indicatorMeans: 'in_stock' | 'out_of_stock' | undefined): Extract<NormalizedMonitorValue, { type: 'stock' }> {
  if (!indicatorMeans) return { type: 'stock', state: 'unknown', evidence };
  const opposite = indicatorMeans === 'in_stock' ? 'out_of_stock' : 'in_stock';
  return { type: 'stock', state: found ? indicatorMeans : opposite, evidence: normalizeText(evidence).text };
}
