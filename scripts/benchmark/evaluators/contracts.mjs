const contracts = {
  '08': { title: 'complete title', author: 'author', language: 'language', ebookNumber: 0, releaseDate: 'YYYY-MM-DD', copyright: 'copyright statement', catalogUrl: 'catalog URL', readingUrl: 'online reading URL', plainTextUrl: 'plain text URL' },
  '09': { archiveUrl: 'news releases archive URL', releases: [{ title: 'complete title', publishedDate: 'YYYY-MM-DD', url: 'release URL', summary: 'summary' }], themes: ['theme'] },
  '10': { origin: 'exact origin name', destination: 'exact destination name', address: 'full destination address', totalDurationMinutes: 0, walkingDurationMinutes: null, transitLines: ['line name'], routeUrl: 'Google Maps route URL', observedAt: 'ISO timestamp with time zone', selectionReason: 'comparison of displayed routes' },
  '01': { version: 'version', publishedDate: 'YYYY-MM-DD (UTC)', releaseUrl: 'details URL', confirmation: 'evidence confirming an official release' },
  '02': { query: 'actual filter query', issues: [{ number: 0, title: 'complete title', url: 'details URL' }] },
  '03': { birthDate: 'YYYY-MM-DD', city: 'city name in English', country: 'present-day country in English', personUrl: 'person article URL', cityUrl: 'city article URL' },
  '04': { title: 'story title', score: 0, comments: 0, commentsUrl: 'comments URL', observedAt: 'ISO timestamp with time zone' },
  '05': { title: 'complete title', year: 0, week: 0, issue: 0, publishedDate: 'YYYY-MM-DD', detailUrl: 'details URL', pdfUrl: 'PDF URL' },
  '06': { papers: [{ title: 'complete title', authors: ['all authors'], firstSubmitted: 'YYYY-MM-DD', url: 'abstract URL', relevance: 'reason the paper is relevant' }] },
  '07': { mutatesOriginal: false, comparator: '(a,b)=>a-b', sorted: [0], original: [0], chrome: 'version', firefox: 'version', safari: 'version', documentUrl: 'documentation URL', compatibilityUrl: 'compatibility section URL' },
};
export function outputContract(jobId) {
  const shape = contracts[jobId.slice(0, 2)];
  if (!shape) return '';
  return `\nAutomated evaluation output requirement: keep your complete English answer and append a JSON code block with this structure: ${JSON.stringify(shape)}. This describes the field structure, not the answers. Replace example numbers and arrays with actual results. Follow the original task for list sizes. Use null for fields you could not verify; do not guess.`;
}
export function parseAnswer(answer) {
  const blocks = [...String(answer).matchAll(/```json\s*([\s\S]*?)```/gi)];
  try {
    const value = JSON.parse(blocks.at(-1)?.[1] || answer);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
