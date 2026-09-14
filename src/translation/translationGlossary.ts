export interface GlossaryEntry { source: string; target: string; language?: string; priority: number; force?: boolean; preserve?: boolean; }
export function glossaryPrompt(entries: GlossaryEntry[] = []) { return entries.length ? `术语表（优先级由高到低）：\n${entries.sort((a,b)=>b.priority-a.priority).map(e=>`${e.source} => ${e.preserve?'保留原文':e.target}`).join('\n')}` : ''; }
