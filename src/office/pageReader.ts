import type { OfficePage, OfficeTable } from './types';

/** Self-contained functions: serialized into the target page by Chrome. */
export function discoverOfficeTables(): OfficeTable[] {
  return [...document.querySelectorAll('table')].flatMap(table => {
    if (!table.getBoundingClientRect().width) return [];
    const rows = [...table.rows].filter(row => row.closest('table') === table);
    const header = rows.find(row => row.querySelector('th'));
    if (!header) return [];
    const headers = [...header.cells].map(cell => (cell.innerText || cell.textContent || '').trim().slice(0, 300));
    if (!headers.length || headers.length > 50) return [];
    return [{ selector: table.id ? `#${CSS.escape(table.id)}` : (() => {
        const parts: string[] = [];
        let element: Element | null = table;
        while (element && element !== document.documentElement) {
          const siblings: Element[] = [...element.parentElement!.children].filter(child => child.tagName === element!.tagName);
          parts.unshift(`${element.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(element) + 1})`);
          element = element.parentElement;
        }
        return `html > ${parts.join(' > ')}`;
      })(),
      headers, sample: rows.filter(row => !row.querySelector('th')).slice(0, 3).map(row => [...row.cells].map(cell => (cell.innerText || cell.textContent || '').trim().slice(0, 150))) }];
  });
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
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== location.origin || (element.target && element.target !== '_self'))
      throw new Error('Pagination must stay on this site and in this tab.');
  }
  if (input.click) element.click();
  return true;
}

export function readOfficeTable(input: { selector: string; limit: number; detailLinkColumn?: number }): OfficePage {
  const tables = document.querySelectorAll(input.selector);
  if (tables.length !== 1 || !(tables[0] instanceof HTMLTableElement)) throw new Error('Table changed or is ambiguous. Re-select the table.');
  const table = tables[0];
  if (!table.getBoundingClientRect().width) throw new Error('Table is not visible. Check your login and page filters.');
  const allRows = [...table.rows].filter(row => row.closest('table') === table && row.getBoundingClientRect().height > 0);
  const header = allRows.find(row => row.querySelector('th'));
  if (!header) throw new Error('No table headers found. Re-select the table.');
  if ([...table.querySelectorAll('td,th')].some(cell => Number(cell.getAttribute('rowspan') || 1) > 1 || Number(cell.getAttribute('colspan') || 1) > 1))
    throw new Error('Merged table cells are not supported. Use a flat table or the site’s export.');
  const headers = [...header.cells].map(cell => (cell.innerText || cell.textContent || '').trim().slice(0, 300));
  const dataRows = allRows.filter(row => !row.querySelector('th') && !row.closest('tfoot'));
  let truncated = dataRows.length > input.limit;
  const rows = dataRows.slice(0, input.limit).map(row => {
    const cells = [...row.cells].map(cell => {
      const text = (cell.innerText || cell.textContent || '').trim();
      if (text.length > 2000) truncated = true;
      return text.slice(0, 2000);
    });
    const links = [...row.querySelectorAll<HTMLAnchorElement>('a[href]')].flatMap(link => {
      try {
        const url = new URL(link.href, location.href);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return [];
        const extension = /\.(pdf|csv|xlsx?|docx?|pptx?|zip|txt)(?:$)/i.test(url.pathname);
        if (!extension && !link.hasAttribute('download')) return [];
        return [{ url: url.href, name: link.download || decodeURIComponent(url.pathname.split('/').pop() || '') || (link.innerText || 'document').trim() }];
      } catch { return []; }
    });
    let detailUrl: string | undefined;
    if (input.detailLinkColumn !== undefined) {
      const candidates = [...(row.cells[input.detailLinkColumn]?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])].flatMap(link => {
        try {
          const url = new URL(link.href, location.href);
          return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? [url.href] : [];
        } catch { return []; }
      });
      if (new Set(candidates).size === 1) detailUrl = candidates[0];
    }
    return { cells, sourceUrl: location.href, detailUrl, links };
  });
  if (rows.some(row => row.cells.length !== headers.length)) throw new Error('Table columns are inconsistent. Check loading or empty-state rows.');
  return { headers, rows, url: location.href, truncated };
}
