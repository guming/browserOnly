/** Self-contained because Playwright serializes this function into the page. */
export function readPageEvidence() {
  const text = (node: Element | null) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const links = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).map(a => ({ text: text(a), href: a.href }));
  const facts: Record<string, unknown> = { headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 50).map(node => text(node)) };
  if (location.hostname === 'news.ycombinator.com') {
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tr.athing[id]'));
    facts.hn = {
      complete: location.pathname === '/' && rows.length > 0 && !!document.querySelector('a.morelink'),
      rows: rows.map(row => {
        const sub = row.nextElementSibling;
        const score = sub?.querySelector('.score');
        const comment = Array.from(sub?.querySelectorAll<HTMLAnchorElement>('a') || []).find(a => /(?:\d+\s+comments?|discuss)$/.test(text(a)));
        return { id: row.id, title: text(row.querySelector('.titleline > a')), score: score ? Number(text(score).replace(/\D/g, '')) : null,
          comments: comment ? Number(text(comment).replace(/\D/g, '') || 0) : null,
          commentsUrl: comment?.href || `https://news.ycombinator.com/item?id=${row.id}` };
      }),
    };
  }
  if (location.hostname === 'github.com') {
    facts.query = (document.querySelector<HTMLInputElement>('input[name="q"],input[aria-label="Search Issues"]')?.value || new URL(location.href).searchParams.get('q') || '');
    facts.issueLinks = links(document.querySelector('main') || document).filter(a => /^https:\/\/github\.com\/microsoft\/vscode\/issues\/\d+$/.test(a.href));
    const currentRows = Array.from(document.querySelectorAll('[data-testid="issue-listitem-title-link"]')).map(a => a.closest('li')).filter((row): row is HTMLLIElement => !!row);
    const issueRows = (currentRows.length ? currentRows : Array.from(document.querySelectorAll('[data-testid="list-row"], [data-testid="issue-row"]'))).map(row => {
      const title = Array.from(row.querySelectorAll<HTMLAnchorElement>('a[href]')).find(a => /^https:\/\/github\.com\/microsoft\/vscode\/issues\/\d+$/.test(a.href) && text(a));
      return title ? { title: text(title), url: title.href, number: Number(title.href.split('/').at(-1)),
        open: !!row.querySelector('.octicon-issue-opened[aria-label="Open"]'),
        labels: Array.from(row.querySelectorAll('[aria-label^="Filter by label "]')).map(element => element.getAttribute('aria-label')!.slice(16)),
      } : null;
    });
    facts.issueRows = issueRows.length && issueRows.every(Boolean) ? issueRows : null;
    facts.releases = Array.from(document.querySelectorAll('section[data-release-anchor]')).map(container => {
        const a = container.querySelector<HTMLAnchorElement>('a[href*="/microsoft/playwright/releases/tag/"]');
        if (!a) return null;
        const badges = Array.from(container.querySelectorAll('.Label')).map(element => text(element)).join(' ');
        const urls = container ? links(container).filter(link => link.href.includes('/releases/tag/')).map(link => link.href) : [];
        return { url: a.href, version: text(a), publishedAt: container?.querySelector('relative-time[datetime],time[datetime]')?.getAttribute('datetime'),
          stable: !/pre-release|prerelease|\bdraft\b/i.test(badges), latest: !!container.querySelector('a[href="/microsoft/playwright/releases/latest"]'),
          unambiguous: new Set(urls).size === 1 };
      }).filter(Boolean);
  }
  if (location.hostname === 'arxiv.org') {
    const meta = (name: string) => Array.from(document.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`)).map(value => value.content);
    facts.paper = { title: meta('citation_title')[0], authors: meta('citation_author'), date: meta('citation_date')[0],
      abstract: text(document.querySelector('blockquote.abstract')), history: text(document.querySelector('.submission-history')) };
  }
  if (location.hostname === 'www.chinacdc.cn') {
    const body = document.body?.innerText || '';
    facts.publicationDate = body.match(/(?:发布时间|发布日期|发布时间：|发布日期：)\s*[:：]?\s*(\d{4}-\d{2}-\d{2})/)?.[1] || null;
    facts.reports = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .filter(a => /^\d{4}年第\d+周第\d+期中国流感监测周报$/.test(text(a))).map(a => ({
        title: text(a), url: a.href,
        publishedDate: Array.from(a.closest('li')?.querySelectorAll('span,time') || []).map(node => text(node)).find(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) || null,
      }));
  }
  if (location.hostname === 'developer.mozilla.org') {
    const roots: ParentNode[] = [document];
    for (let index = 0; index < roots.length && index < 100; index++) {
      for (const element of Array.from(roots[index].querySelectorAll('*'))) if (element.shadowRoot) roots.push(element.shadowRoot);
    }
    const table = roots.map(root => root.querySelector<HTMLTableElement>('table.bc-table')).find(Boolean);
    const feature = table && Array.from(table.querySelectorAll('tbody tr')).find(row => /toSorted/.test(text(row.querySelector('th'))));
    const versions: Record<string, string> = {};
    if (feature) {
      for (const browser of ['chrome', 'firefox', 'safari']) {
        const cell = feature.querySelector(`td.bc-browser-${browser}.bc-supports-yes`);
        const value = text(cell?.querySelector('.bc-version-label') || null).match(/^(\d+(?:\.\d+)*)$/)?.[1];
        if (value && /Full support/.test(text(cell?.querySelector('.bc-support-level') || null))) versions[browser] = value;
      }
    }
    facts.compatibility = versions;
  }
  return {
    title: document.title, text: (document.body?.innerText || '').slice(0, 50000),
    textTruncated: (document.body?.innerText || '').length > 50000,
    links: links(document).slice(0, 500), linksTruncated: document.querySelectorAll('a[href]').length > 500,
    facts,
  };
}
