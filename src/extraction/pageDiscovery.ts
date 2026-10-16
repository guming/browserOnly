/** Serialized into the page by Chrome; do not reference module globals. */
export function discoverPaginationControls(): Array<{ selector: string; label: string }> {
  return [...document.querySelectorAll('button, a, [role="button"]')].flatMap(element => {
    const label = element.getAttribute('aria-label') || element.textContent?.trim() || '';
    if (!/next|下一页|下页|›|»/i.test(label) || !element.getBoundingClientRect().width) return [];
    const parts: string[] = [];
    let node: Element | null = element;
    while (node && node !== document.documentElement) {
      const siblings: Element[] = [...node.parentElement!.children].filter(child => child.tagName === node!.tagName);
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
      node = node.parentElement;
    }
    return [{ selector: `html > ${parts.join(' > ')}`, label: label.slice(0, 100) }];
  });
}
