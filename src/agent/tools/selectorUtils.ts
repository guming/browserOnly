/** Return selector variants that preserve intent when markup adds a class or changes an element tag. */
export function selectorCandidates(selector: string): string[] {
  const original = selector.trim();
  if (!original) return [selector];

  const candidates = [original];
  const exactId = original.match(/^(?:[a-z][\w-]*)?\[id\s*=\s*(["'])(.*?)\1\]$/i);
  if (exactId?.[2]) candidates.push(`#${escapeCssIdentifier(exactId[2])}`);

  const exactClass = original.match(/^(?:([a-z][\w-]*)\s*)?\[class\s*=\s*(["'])(.*?)\2\]$/i);
  if (exactClass?.[3]) {
    const classes = exactClass[3].trim().split(/\s+/).filter(Boolean).map(escapeCssIdentifier);
    if (classes.length) candidates.push(`${exactClass[1] ?? ''}.${classes.join('.')}`);
  }

  return [...new Set(candidates)];
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
}
