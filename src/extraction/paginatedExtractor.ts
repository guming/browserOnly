import type { ExtractionResult } from './types';

/** Collect bounded pages while preserving already collected data on failure. */
export async function extractPaginatedRecords(maxPages: number, read: () => Promise<ExtractionResult>, next: () => Promise<boolean>, maxRows = 100): Promise<ExtractionResult> {
  let result: ExtractionResult | undefined;
  const fingerprints = new Set<string>();
  const records = new Set<string>();
  for (let index = 0; index < maxPages; index++) {
    try {
      const page = await read();
      const fingerprint = JSON.stringify(page.rows);
      if (fingerprints.has(fingerprint)) throw new Error('Pagination returned a repeated page.');
      fingerprints.add(fingerprint);
      result ??= { ...page, rows: [], warnings: [], sourceUrls: [], pagesRead: 0 };
      if (JSON.stringify(result.fields) !== JSON.stringify(page.fields)) throw new Error('Record structure changed after pagination.');
      for (const row of page.rows) {
        const key = String(row.source_url ?? JSON.stringify(row));
        if (result.rows.length < maxRows && !records.has(key)) { records.add(key); result.rows.push(row); }
      }
      result.warnings.push(...page.warnings);
      result.sourceUrls = [...new Set([...result.sourceUrls, ...page.sourceUrls])];
      result.pagesRead = index + 1;
      result.partial ||= page.partial;
      if (result.rows.length >= maxRows) { result.partial = true; result.warnings.push(`Collection stopped at ${maxRows} records.`); break; }
      if (index + 1 < maxPages && !(await next())) break;
    } catch (error) {
      if (!result) throw error;
      result.partial = true;
      result.warnings.push(error instanceof Error ? error.message : String(error));
      break;
    }
  }
  if (!result) throw new Error('No pages were extracted.');
  return result;
}
