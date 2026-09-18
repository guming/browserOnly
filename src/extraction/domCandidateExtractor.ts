export interface DomCandidate { text: string; sourceUrl?: string; }

export function extractDomCandidates(html: string, sourceUrl?: string): DomCandidate[] {
  const candidates: DomCandidate[] = [];
  const tableRows = html.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
  for (const row of tableRows) {
    const text = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) candidates.push({ text, sourceUrl });
  }
  if (candidates.length) return candidates;
  const text = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? [{ text, sourceUrl }] : [];
}
