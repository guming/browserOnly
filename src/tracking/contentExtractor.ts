import type { Page } from "playwright-crx";
import { CachedPageContent, PageSection } from './contentCacheService';
import { logWithTimestamp } from '../background/utils';

/**
 * Extract structured content from a page
 * This includes sections with headings, paragraphs, and metadata
 */
export async function extractStructuredContent(page: Page): Promise<CachedPageContent> {
  try {
    const url = await page.url();
    const title = await page.title();

    // Extract content with structure preservation
    const extraction = await page.evaluate(() => {
      const sections: Array<{
        heading: string;
        level: number;
        content: string;
        xpath: string;
        position: number;
        wordCount: number;
      }> = [];

      const allText: string[] = [];
      let currentHeading: Element | null = null;
      let currentContent: string[] = [];
      let sectionIndex = 0;

      // Helper function to get XPath
      function getXPath(element: Element): string {
        const segments: string[] = [];
        let current: Element | null = element;

        while (current && current !== document.body) {
          let index = 1;
          let sibling = current.previousElementSibling;

          while (sibling) {
            if (sibling.tagName === current.tagName) index++;
            sibling = sibling.previousElementSibling;
          }

          const tagName = current.tagName.toLowerCase();
          const segment = `${tagName}[${index}]`;
          segments.unshift(segment);

          current = current.parentElement;
        }

        return '//' + segments.join('/');
      }

      // Helper function to save current section
      function saveSection() {
        if (currentHeading && currentContent.length > 0) {
          const content = currentContent.join(' ').trim();
          const wordCount = content.split(/\s+/).length;

          sections.push({
            heading: currentHeading.textContent?.trim() || '',
            level: parseInt(currentHeading.tagName[1]),
            content: content,
            xpath: getXPath(currentHeading),
            position: sectionIndex++,
            wordCount: wordCount
          });

          currentContent = [];
        }
      }

      // Create tree walker for structured extraction
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as Element;

              // Accept headings
              if (/^H[1-6]$/.test(el.tagName)) {
                return NodeFilter.FILTER_ACCEPT;
              }

              // Skip non-visible elements
              if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'META', 'LINK'].includes(el.tagName)) {
                return NodeFilter.FILTER_REJECT;
              }
            }

            if (node.nodeType === Node.TEXT_NODE) {
              const parent = node.parentElement;
              if (parent && parent.offsetParent !== null && node.textContent?.trim()) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }

            return NodeFilter.FILTER_SKIP;
          }
        }
      );

      // Walk through DOM
      while (walker.nextNode()) {
        const node = walker.currentNode;

        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;

          // Save previous section
          saveSection();

          // Start new section with this heading
          currentHeading = el;

        } else if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) {
            currentContent.push(text);
            allText.push(text);
          }
        }
      }

      // Save last section
      saveSection();

      // If no headings found, create a single section with all text
      if (sections.length === 0 && allText.length > 0) {
        sections.push({
          heading: 'Main Content',
          level: 1,
          content: allText.join(' '),
          xpath: '//body',
          position: 0,
          wordCount: allText.join(' ').split(/\s+/).length
        });
      }

      return {
        fullText: allText.join('\n'),
        sections: sections,
        metadata: {
          wordCount: allText.join(' ').split(/\s+/).length,
          hasHeadings: sections.length > 1 || (sections.length === 1 && sections[0].heading !== 'Main Content')
        }
      };
    });

    // Construct the cached content object
    const extractionData = extraction as {
      fullText: string;
      sections: Array<{
        heading: string;
        level: number;
        content: string;
        xpath: string;
        position: number;
        wordCount: number;
      }>;
      metadata: {
        wordCount: number;
        hasHeadings: boolean;
      };
    };

    const content: CachedPageContent = {
      url,
      title,
      fullText: extractionData.fullText,
      sections: extractionData.sections,
      metadata: {
        extractedAt: Date.now(),
        pageHash: '', // Will be set by cache service
        wordCount: extractionData.metadata.wordCount,
        hasHeadings: extractionData.metadata.hasHeadings
      }
    };

    logWithTimestamp(
      `Extracted ${content.sections.length} sections, ${content.metadata.wordCount} words from ${url}`,
      'log'
    );

    return content;

  } catch (error) {
    logWithTimestamp(`Error extracting structured content: ${error}`, 'error');
    throw error;
  }
}

/**
 * Extract main content only (skip headers, footers, navigation)
 */
export async function extractMainContent(page: Page): Promise<string> {
  try {
    const mainText = (await page.evaluate(() => {
      // Try to find main content containers
      const mainSelectors = [
        'main',
        'article',
        '[role="main"]',
        '#content',
        '#main',
        '.content',
        '.main-content'
      ];

      for (const selector of mainSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          // Found main content container
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: (node) => {
                const parent = node.parentElement;
                if (parent && parent.offsetParent !== null && node.textContent?.trim()) {
                  return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
              }
            }
          );

          const texts: string[] = [];
          while (walker.nextNode()) {
            const text = walker.currentNode.textContent?.trim();
            if (text) texts.push(text);
          }

          if (texts.length > 0) {
            return texts.join('\n');
          }
        }
      }

      // Fallback: extract all visible text
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (parent && parent.offsetParent !== null && node.textContent?.trim()) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_REJECT;
          }
        }
      );

      const texts: string[] = [];
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent?.trim();
        if (text) texts.push(text);
      }

      return texts.join('\n');
    })) as string;

    return mainText;

  } catch (error) {
    logWithTimestamp(`Error extracting main content: ${error}`, 'error');
    throw error;
  }
}

/**
 * Extract content by selector
 */
export async function extractContentBySelector(
  page: Page,
  selector: string
): Promise<string> {
  try {
    const content = (await page.evaluate((sel: string) => {
      const elements = document.querySelectorAll(sel);

      if (elements.length === 0) {
        return '';
      }

      const texts: string[] = [];

      elements.forEach(element => {
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const parent = node.parentElement;
              if (parent && parent.offsetParent !== null && node.textContent?.trim()) {
                return NodeFilter.FILTER_ACCEPT;
              }
              return NodeFilter.FILTER_REJECT;
            }
          }
        );

        while (walker.nextNode()) {
          const text = walker.currentNode.textContent?.trim();
          if (text) texts.push(text);
        }
      });

      return texts.join('\n');
    }, selector)) as string;

    return content;

  } catch (error) {
    logWithTimestamp(`Error extracting content by selector: ${error}`, 'error');
    throw error;
  }
}

/**
 * Get page summary (title + first few paragraphs)
 */
export async function getPageSummary(page: Page, maxLength: number = 500): Promise<string> {
  try {
    const content = await extractStructuredContent(page);

    const summary: string[] = [content.title];

    // Add first few sections until we reach maxLength
    let currentLength = content.title.length;

    for (const section of content.sections) {
      if (currentLength >= maxLength) break;

      const sectionText = `\n\n## ${section.heading}\n${section.content}`;
      const remaining = maxLength - currentLength;

      if (sectionText.length <= remaining) {
        summary.push(sectionText);
        currentLength += sectionText.length;
      } else {
        // Add truncated section
        const truncated = sectionText.substring(0, remaining) + '...';
        summary.push(truncated);
        break;
      }
    }

    return summary.join('');

  } catch (error) {
    logWithTimestamp(`Error getting page summary: ${error}`, 'error');
    throw error;
  }
}
