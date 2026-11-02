/** One synchronous DOM snapshot; no count→innerText race or per-selector auto-wait. */
export function workflowPageSnapshot(options: { mode: 'main' | 'all'; limit: number }) {
  const body = document.body;
  if (!body) return { ready: false, title: document.title, url: location.href, text: '', headings: [] as string[] };
  const visible = (element: Element) => {
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' && element.getClientRects().length > 0;
  };
  let root: Element = body;
  if (options.mode === 'main') {
    const main = Array.from(document.querySelectorAll('main,article,[role="main"],#content,#main,.content,.main-content')).find(element => visible(element) && element.textContent?.trim());
    if (main) root = main;
  }
  const out: string[] = [];
  let size = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.textContent?.trim() && node.parentElement && !node.parentElement.closest('script,style,noscript,template,[hidden],[aria-hidden="true"]') && visible(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  while (walker.nextNode() && size < options.limit) {
    const node = walker.currentNode;
    let text = node.textContent!.replace(/\s+/g, ' ').trim();
    const anchor = node.parentElement?.closest('a[href]');
    if (anchor) {
      try {
        const url = new URL(anchor.getAttribute('href')!, document.baseURI);
        if (/^https?:$/.test(url.protocol) && !url.username && !url.password) text += ` [URL: ${url.href}]`;
      } catch { /* Invalid links remain text. */ }
    }
    out.push(text.slice(0, Math.max(0, options.limit - size)));
    size += text.length + 1;
  }
  return {
    ready: true, title: document.title, url: location.href,
    text: out.join('\n').slice(0, options.limit),
    headings: Array.from(root.querySelectorAll('h1,h2')).filter(visible).slice(0, 100).map(element => (element.textContent || '').trim().slice(0, 300)),
  };
}
