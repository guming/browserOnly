import { logWithTimestamp } from '../../background/utils';
import { Page } from 'playwright-crx';
import { ToolFactory } from './types';
import { DynamicTool } from 'langchain/tools';
import { getCurrentTabId, withActivePage } from './utils';


export const startExtract : ToolFactory = (page: Page) =>
  
  new DynamicTool({
    name: "start_extract",
    description: "Start content extraction from HTML. Provide URL and HTML content.",
    func: async (input: string) => {
      try {
        
        return await withActivePage(page, async (activePage) => {

          // await page.addScriptTag({ path: path.resolve(__dirname, 'turndown.js') });
          const tabId = await getCurrentTabId(activePage);
          const title = await activePage.title();
          const markdownFromPage: string = await page.evaluate(async () => {
              const MAX_DEPTH = 20;

              const tagsToRemove = [
                'script', 'style', 'nav', 'footer', 'aside', 'noscript',
                'iframe', 'header', 'form', 'svg', 'canvas', 'link', 'meta'
              ];

              tagsToRemove.forEach(tag => {
                document.querySelectorAll(tag).forEach(el => el.remove());
              });

              const trimTextNodes = (node: Node) => {
                node.childNodes.forEach(child => {
                  if (child.nodeType === Node.TEXT_NODE) {
                    child.textContent = child.textContent?.replace(/\s+/g, ' ').trim() || '';
                  } else if (child.nodeType === Node.ELEMENT_NODE) {
                    trimTextNodes(child);
                  }
                });
              };
              trimTextNodes(document);

              const domToMarkdown = (dom: HTMLElement) => {
                const tagHandlers = new Map<string, (el: HTMLElement, content: string) => string>([
                  ['h1', (_, c) => `# ${c}\n\n`],
                  ['h2', (_, c) => `## ${c}\n\n`],
                  ['h3', (_, c) => `### ${c}\n\n`],
                  ['h4', (_, c) => `#### ${c}\n\n`],
                  ['h5', (_, c) => `##### ${c}\n\n`],
                  ['h6', (_, c) => `###### ${c}\n\n`],
                  ['p',  (_, c) => `${c}\n\n`],
                  ['strong', (_, c) => `**${c}**`],
                  ['b', (_, c) => `**${c}**`],
                  ['em', (_, c) => `*${c}*`],
                  ['i', (_, c) => `*${c}*`],
                  ['a',  (el, c) => `[${c}](${el.getAttribute('href')})`],
                  ['br', () => `\n`],
                  ['hr', () => `\n---\n`],
                  ['img', (el) => {
                    const alt = el.getAttribute('alt') || '';
                    const src = el.getAttribute('src') || '';
                    return `![${alt}](${src})`;
                  }],
                  ['code', (_, c) => `\`${c}\``],
                  ['pre', el => `\n\`\`\`\n${(el.textContent || '').trim()}\n\`\`\`\n\n`],
                  ['blockquote', (_, c) => c.replace(/^/gm, '> ') + '\n\n'],
                ]);

                const walker = (node: Node, depth: number = 0): string => {
                  if (depth > MAX_DEPTH) return '';

                  if (!node) return '';

                  if (node.nodeType === Node.TEXT_NODE) {
                    return (node as Text).data.trim();
                  }

                  if (node.nodeType !== Node.ELEMENT_NODE) {
                    return '';
                  }

                  const el = node as HTMLElement;
                  const tag = el.tagName.toLowerCase();

                  let content = '';
                  for (let i = 0; i < el.childNodes.length; i++) {
                    content += walker(el.childNodes[i], depth + 1);
                  }

                  if (tag === 'ul') {
                    return Array.from(el.children)
                      .map(li => `- ${walker(li, depth + 1)}\n`)
                      .join('') + '\n';
                  }

                  if (tag === 'ol') {
                    return Array.from(el.children)
                      .map((li, i) => `${i + 1}. ${walker(li, depth + 1)}\n`)
                      .join('') + '\n';
                  }

                  if (tag === 'li') {
                    return content;
                  }

                  if (tag === 'table') {
                    const rows = Array.from(el.querySelectorAll('tr'));
                    const markdownRows: string[] = [];

                    rows.forEach((tr, rowIndex) => {
                      const cells = Array.from(tr.children).map(td => walker(td, depth + 1));
                      const rowLine = `| ${cells.join(' | ')} |`;

                      if (rowIndex === 0) {
                        const separator = `| ${cells.map(() => '---').join(' | ')} |`;
                        markdownRows.push(rowLine, separator);
                      } else {
                        markdownRows.push(rowLine);
                      }
                    });
                    return markdownRows.join('\n') + '\n\n';
                  }

                  const handler = tagHandlers.get(tag);
                  if (handler) {
                    return handler(el, content);
                  }

                  return content;
                };

                return walker(dom, 0).trim();
              };
            
             
              return domToMarkdown(document.body);
          });
           if (tabId) {
              chrome.runtime.sendMessage({
                action: 'download-markdown',
                tabId: tabId,
                content: markdownFromPage,
                filename: 'page.md'
              });
              console.log(`Sent markdown message for tab ${tabId} with title "${title}" from start_extract`);
            }
          console.log('markdown',markdownFromPage);
          return `scrape page finished`;
        });
      } catch (error) {
        console.log(`Error parsing '${input}': ${
          error instanceof Error ? error.message : String(error)}`);
        return `Error clicking '${input}': ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
});




export function getExtractStatus() {
  return {
    name: "get_crawler_status",
    description: "Get the current status of the crawler (running or idle).",
    func: async (): Promise<string> => {
      try {
        return `Extract service is ready`;
      } catch (error) {
        logWithTimestamp(`Error getting crawler status: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error getting crawler status: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}