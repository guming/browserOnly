import type { OfficeConfig, OfficeReport, OfficeRow } from './types';

export function sortOfficeRows(rows: OfficeRow[], sort: OfficeConfig['sort']): OfficeRow[] {
  if (!sort) return rows;
  const priority = sort.priority?.map(value => value.toLocaleLowerCase()) ?? [];
  return [...rows].sort((left, right) => {
    const a = left.cells[sort.column]?.trim() ?? '';
    const b = right.cells[sort.column]?.trim() ?? '';
    if (priority.length) {
      const rank = (value: string) => { const index = priority.indexOf(value.toLocaleLowerCase()); return index < 0 ? priority.length : index; };
      const difference = rank(a) - rank(b);
      if (difference) return difference;
    }
    const difference = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    return sort.direction === 'descending' ? -difference : difference;
  });
}

export function matchesOfficeRule(cells: string[], rule: OfficeConfig['rule'], now: number): boolean | undefined {
  if (!rule) return true;
  const value = cells[rule.column]?.trim() ?? '';
  if (rule.operator === 'contains') return value.toLocaleLowerCase().includes(rule.value.toLocaleLowerCase());
  if (rule.operator === 'equals') return value.toLocaleLowerCase() === rule.value.toLocaleLowerCase();
  if (!value) return undefined;
  if (rule.operator === 'older_than_days') {
    // Require an unambiguous ISO date; locale-dependent dates must not silently match.
    if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) return undefined;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time < now - Number(rule.value) * 86400000 : undefined;
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return undefined;
  return rule.operator === 'greater_than' ? Number(value) > Number(rule.value) : Number(value) < Number(rule.value);
}

export function compareOfficeReports(report: OfficeReport, previous?: OfficeReport): OfficeReport['comparison'] {
  if (!previous?.complete || !report.complete || report.config.keyColumn === undefined
    || report.sourceUrl !== previous.sourceUrl || JSON.stringify(report.config) !== JSON.stringify(previous.config)) return undefined;
  const before = new Map(previous.rows.map(row => [row.key, row]));
  const after = new Map(report.rows.map(row => [row.key, row]));
  return { previousAt: previous.startedAt,
    added: report.rows.filter(row => !before.has(row.key)).map(row => row.key),
    changed: report.rows.filter(row => before.has(row.key) && JSON.stringify(before.get(row.key)!.cells) !== JSON.stringify(row.cells)).map(row => row.key),
    unchanged: report.rows.filter(row => before.has(row.key) && JSON.stringify(before.get(row.key)!.cells) === JSON.stringify(row.cells)).map(row => row.key),
    noLongerMatched: previous.rows.filter(row => !after.has(row.key)),
  };
}

export function addArchiveFiles(report: OfficeReport, row: OfficeRow): void {
  for (const link of row.links) {
    if (report.files.some(file => file.url === link.url)) continue;
    if (report.files.length >= 100) { report.complete = false; if (!report.warnings.includes('Only the first 100 files are listed.')) report.warnings.push('Only the first 100 files are listed.'); break; }
    report.files.push({ ...link, id: `file-${report.files.length + 1}`, sourceUrl: row.sourceUrl, status: 'ready' });
  }
}

export function safePathPart(value: string): string {
  const cleaned = [...value].map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? '-' : char).join('').replace(/[<>:"/\\|?*]/g, '-').replace(/\.{2,}/g, '-').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 100);
  return !cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned) ? `file-${cleaned || 'document'}` : cleaned;
}

export function reportCsv(report: OfficeReport): string {
  const escape = (value: string) => `"${(/^[\s]*[=+\-@]/.test(value) ? "'" : '') + value.replace(/"/g, '""')}"`;
  return '\uFEFF' + [[...report.config.headers, 'Source URL', 'Record URL'], ...report.rows.map(row => [...row.cells, row.sourceUrl, row.detailUrl ?? ''])].map(row => row.map(escape).join(',')).join('\r\n');
}
