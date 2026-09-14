import { TranslationUnit } from './types';

export interface ProviderTranslationItem { sourceId?: string | number; translation?: unknown; }

export function mapProviderTranslations(
  units: TranslationUnit[],
  parsed: ProviderTranslationItem[],
): Map<string, string> {
  const translations = new Map<string, string>();
  units.forEach((unit, index) => {
    const transportId = String(index + 1);
    const item = parsed.find((candidate) => String(candidate.sourceId) === transportId);
    if (typeof item?.translation === 'string' && item.translation.length > 0) {
      translations.set(unit.sourceId, item.translation);
    }
  });
  return translations;
}
