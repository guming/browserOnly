export const norm = value => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
export const equal = (left, right) => norm(left) !== '' && norm(left) === norm(right);
export const check = (id, passed, evidence) => ({ id, passed, evidence });
export const unknown = (id, reason) => check(id, null, reason);
export function url(value) {
  try { const result = new URL(value); return result.protocol === 'https:' ? result : null; }
  catch { return null; }
}
export function sameUrl(left, right) {
  const a = url(left), b = url(right);
  return !!a && !!b && a.origin === b.origin && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '') && a.search === b.search;
}
export function pages(execution, host) {
  return (execution.events || []).map((event, index) => ({ ...event, index }))
    .filter(event => event.content && url(event.url)?.hostname === host);
}
export const visited = (events, address) => events.find(event => sameUrl(event.url, address));
export function clickBetween(execution, before, after) {
  const segment = (execution.events || []).slice(before.index + 1, after.index);
  const lastPage = segment.filter(event => event.content && url(event.url)).at(-1) || before;
  const navigation = segment.filter(event => event.kind === 'tool' && event.trace?.result?.ok === true &&
    /^browser_(?:click|navigate(?:_back|_forward|_tab)?|tab_select|tab_new)$/.test(event.trace.toolName)).at(-1);
  return sameUrl(lastPage.url, before.url) && navigation?.trace.toolName === 'browser_click';
}
export function fullObservation(execution, titles) {
  return (execution.events || []).some(event => event.kind === 'tool' && event.trace?.result?.ok === true &&
    /browser_(read_text|read_main|snapshot_dom|accessible_tree|query)/.test(event.trace.toolName) &&
    titles.every(title => norm(JSON.stringify(event.trace.result.data)).includes(norm(title))));
}
export function missingFields(answer, fields) { return fields.some(field => answer[field] === null || answer[field] === undefined); }
