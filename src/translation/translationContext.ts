import { hashText } from './types';
export function buildPageContext(title: string, site: string, headings: string[], pageType='article') { const text=[title,site,headings.slice(0,6).join(' > '),pageType].filter(Boolean).join('\n'); return { text, contextHash: hashText(text) }; }
