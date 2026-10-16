import type { OfficeConfig, OfficePage, OfficeTable } from './types';

/**
 * Self-contained functions: Chrome serializes these into the target page, so
 * they must not close over extension modules. A collection can be a real table,
 * a semantic list, or sibling card/article records.
 */
export function discoverOfficeTables(): OfficeTable[] {
  const visible = (element: Element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const text = (element: Element, limit = 300) => ((element as HTMLElement).innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const path = (element: Element): string => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      if (current.id) { parts.unshift(`#${CSS.escape(current.id)}`); break; }
      const siblings = [...current.parentElement!.children].filter(child => child.tagName === current!.tagName);
      parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`);
      current = current.parentElement;
    }
    return parts[0]?.startsWith('#') ? parts.join(' > ') : `html > ${parts.join(' > ')}`;
  };
  const collection = (selector: string, records: Element[], sourceKind: OfficeConfig['sourceKind'], headers: string[]): OfficeTable => ({
    selector, sourceKind, headers, recordCount: records.length,
    sample: records.slice(0, 3).map(record => [text(record, 600)]),
  });
  const found: OfficeTable[] = [];
  for (const table of [...document.querySelectorAll('table')]) {
    if (!visible(table)) continue;
    const rows = [...(table as HTMLTableElement).rows].filter(row => row.closest('table') === table && visible(row));
    const header = rows.find(row => row.querySelector('th'));
    if (!header) continue;
    const headers = [...header.cells].map(cell => text(cell));
    const data = rows.filter(row => !row.querySelector('th') && !row.closest('tfoot'));
    if (headers.length && headers.length <= 50 && data.length) found.push({ selector: path(table), sourceKind: 'table', headers, recordCount: data.length, sample: data.slice(0, 3).map(row => [...row.cells].map(cell => text(cell, 150))) });
  }
  const seen = new Set(found.map(item => item.selector));
  const addRecords = (parent: Element, records: Element[], sourceKind: OfficeConfig['sourceKind']) => {
    const usable = records.filter(visible).filter(record => text(record, 40));
    if (usable.length < 2) return;
    const selector = `${path(parent)} > ${usable[0].tagName.toLowerCase()}`;
    if (seen.has(selector) || found.some(item => item.selector === selector || selector.startsWith(`${item.selector} >`))) return;
    seen.add(selector);
    found.push(collection(selector, usable, sourceKind, ['Record']));
  };
  for (const list of [...document.querySelectorAll('[role="list"], ul, ol')]) {
    addRecords(list, [...list.children].filter(child => child.matches('[role="listitem"], li')), 'list');
  }
  // Repeated direct children are cards only when their container gives a
  // card/article signal. This avoids treating arbitrary layout divs as records.
  for (const parent of [...document.querySelectorAll('main, section, [role="main"], [class*="list" i], [class*="grid" i], [class*="results" i]')]) {
    const records = [...parent.children].filter(child => child.matches('article, [class*="card" i], [class*="item" i], [data-testid]'));
    addRecords(parent, records, 'repeated-block');
  }
  return found;
}

export function officeNextPage(input: { selector: string; click: boolean }): boolean {
  const elements = document.querySelectorAll(input.selector);
  if (elements.length !== 1) throw new Error('Next-page control is missing or ambiguous. Only pages already read are included.');
  const element = elements[0] as HTMLButtonElement | HTMLAnchorElement;
  if (!['BUTTON', 'A'].includes(element.tagName)) throw new Error('Select a button or link for pagination.');
  if (element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled')) return false;
  if (!element.getBoundingClientRect().width) throw new Error('Next-page control is hidden.');
  if (element instanceof HTMLButtonElement && element.form && element.type === 'submit') throw new Error('Pagination cannot submit a form.');
  if (element instanceof HTMLAnchorElement && element.hasAttribute('href') && element.getAttribute('href') !== '#') {
    const url = new URL(element.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== location.origin || (element.target && element.target !== '_self')) throw new Error('Pagination must stay on this site and in this tab.');
  }
  if (input.click) element.click();
  return true;
}

export function readOfficeRecords(input: { selector: string; sourceKind?: OfficeConfig['sourceKind']; limit: number; detailLinkColumn?: number }): OfficePage {
  const sourceKind = input.sourceKind ?? 'table';
  const selected = document.querySelectorAll(input.selector);
  if (!selected.length) throw new Error('The selected records are no longer available. Re-select the collection.');
  const recordElements = sourceKind === 'table'
    ? (() => {
      if (selected.length !== 1 || !(selected[0] instanceof HTMLTableElement)) throw new Error('Table changed or is ambiguous. Re-select the collection.');
      const rows = [...selected[0].rows].filter(row => row.closest('table') === selected[0] && row.getBoundingClientRect().height > 0);
      const header = rows.find(row => row.querySelector('th'));
      if (!header) throw new Error('No table headers found. Re-select the collection.');
      return rows.filter(row => !row.querySelector('th') && !row.closest('tfoot'));
    })()
    : [...selected].filter(element => element.getBoundingClientRect().height > 0);
  if (!recordElements.length) throw new Error('No visible records found. Check login and page filters.');
  const headers = sourceKind === 'table'
    ? [...[...(selected[0] as HTMLTableElement).rows].find(row => row.querySelector('th'))!.cells].map(cell => (cell.innerText || cell.textContent || '').trim().slice(0, 300))
    : ['Record'];
  let truncated = recordElements.length > input.limit;
  const rows = recordElements.slice(0, input.limit).map(record => {
    const cells = sourceKind === 'table'
      ? [...(record as HTMLTableRowElement).cells].map(cell => { const value = (cell.innerText || cell.textContent || '').trim(); if (value.length > 2000) truncated = true; return value.slice(0, 2000); })
      : [((record as HTMLElement).innerText || record.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2000)];
    const links = [...record.querySelectorAll<HTMLAnchorElement>('a[href]')].flatMap(link => {
      try { const url = new URL(link.href, location.href); const extension = /\.(pdf|csv|xlsx?|docx?|pptx?|zip|txt)(?:$)/i.test(url.pathname); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && (extension || link.hasAttribute('download')) ? [{ url: url.href, name: link.download || decodeURIComponent(url.pathname.split('/').pop() || '') || (link.innerText || 'document').trim() }] : []; } catch { return []; }
    });
    const safeRecordUrls = (scope: Element) => [...(scope.matches('a[href]') ? [scope as HTMLAnchorElement] : []), ...scope.querySelectorAll<HTMLAnchorElement>('a[href]')].flatMap(link => {
      try {
        const url = new URL(link.href, location.href);
        const isDownload = /\.(pdf|csv|xlsx?|docx?|pptx?|zip|txt)(?:$)/i.test(url.pathname) || link.hasAttribute('download');
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !isDownload ? [url.href] : [];
      } catch { return []; }
    });
    const detailScope: Element = input.detailLinkColumn !== undefined && sourceKind === 'table'
      ? ((record as HTMLTableRowElement).cells[input.detailLinkColumn] ?? record)
      : record;
    const candidates = [...new Set(safeRecordUrls(detailScope))];
    // A single link is unambiguous, so preserve it without forcing users to
    // configure a column. Multiple links still require an explicit column.
    const detailUrl = candidates.length === 1 ? candidates[0] : undefined;
    return { cells, sourceUrl: location.href, detailUrl, links };
  });
  if (sourceKind === 'table' && rows.some(row => row.cells.length !== headers.length)) throw new Error('Table columns are inconsistent. Check loading or empty-state rows.');
  return { headers, rows, url: location.href, truncated };
}

/** Backward compatible public entry point for existing workflows and tests. */
export function readOfficeTable(input: { selector: string; limit: number; detailLinkColumn?: number }): OfficePage {
  return readOfficeRecords({ ...input, sourceKind: 'table' });
}
