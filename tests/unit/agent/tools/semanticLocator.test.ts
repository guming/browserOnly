import { parseTarget, validateTarget, resolveTarget, readTargetState, TargetError } from '../../../../src/agent/tools/semanticLocator';

function locator(nodes: Element[]): any {
  return {
    and: (other: any) => locator(nodes.filter(node => other.nodes.includes(node))), nodes,
    count: async () => nodes.length,
    evaluateAll: async (fn: any) => fn(nodes),
    evaluate: async (fn: any) => fn(nodes[0]),
    locator: (selector: string) => locator(nodes.flatMap(node => Array.from(node.querySelectorAll(selector)))),
    getByText: (text: string, options: any) => locator(nodes.flatMap(node => Array.from(node.querySelectorAll('*'))).filter(node => options.exact ? node.textContent === text && !Array.from(node.children).some(child => child.textContent === text) : node.textContent?.includes(text))),
    getByRole: (role: string, options: any) => locator(nodes.flatMap(node => Array.from(node.querySelectorAll(`[role="${role}"]`))).filter(node => !options.name || (node.getAttribute('aria-label') || node.textContent) === options.name)),
  };
}
function page(): any {
  const root = locator([document.body]);
  return { ...root, locator: (selector: string) => selector === ':visible' ? locator(Array.from(document.querySelectorAll('*')).filter(node => !node.closest('[hidden]'))) : root.locator(selector) };
}
beforeEach(() => { document.body.innerHTML = '<button hidden>京东自营</button><div role="menu" id="menu"><button role="menuitem" aria-checked="true">京东自营</button></div><section id="other"><button role="menuitem">京东自营</button></section>'; });
it('returns a bounded ambiguity response for hundreds of matches', async () => {
  document.body.innerHTML = '<button>Choice</button>'.repeat(300);
  try { await resolveTarget(page(), { text: 'Choice' }); throw Error('expected ambiguity'); }
  catch (error) {
    expect(error).toBeInstanceOf(TargetError);
    expect((error as TargetError).code).toBe('AMBIGUOUS_TARGET');
    expect((error as TargetError).totalCount).toBe(300);
    expect((error as TargetError).candidates).toHaveLength(5);
  }
});
it('uses a unique visible scope to disambiguate exact text or role/name', async () => {
  const target = await resolveTarget(page(), { text: '京东自营', scope: '#menu' });
  expect(await target.count()).toBe(1);
  expect((await readTargetState(target)).checked).toBe(true);
  expect(await (await resolveTarget(page(), { role: 'menuitem', name: '京东自营', scope: '#menu' })).count()).toBe(1);
});
it('does not guess when the scope is ambiguous and ignores hidden targets', async () => {
  await expect(resolveTarget(page(), { text: '京东自营' })).rejects.toMatchObject({ code: 'AMBIGUOUS_TARGET', totalCount: 2 });
  await expect(resolveTarget(page(), { text: '京东自营', scope: 'div,section' })).rejects.toMatchObject({ code: 'AMBIGUOUS_TARGET' });
  await expect(resolveTarget(page(), { text: '不存在' })).rejects.toMatchObject({ code: 'TARGET_NOT_FOUND' });
});
it('does not treat unknown or mixed state as false', async () => {
  document.body.innerHTML = '<button aria-checked="mixed">Mixed</button>';
  const state = await readTargetState(await resolveTarget(page(), { text: 'Mixed' }));
  expect(state.checked).toBeNull(); expect(state.selected).toBeNull(); expect(state.expanded).toBeNull();
});
it('validates inputs and keeps legacy text and CSS targeting available', () => {
  expect(parseTarget('京东自营')).toEqual({ text: '京东自营' });
  expect(parseTarget('#menu')).toEqual({ selector: '#menu' });
  expect(() => validateTarget({ text: 'X', selector: '.x' })).toThrow(TargetError);
  expect(() => validateTarget({ text: 'X', exact: 'false' })).toThrow(TargetError);
  expect(() => parseTarget('')).toThrow(TargetError);
});

it('excludes disabled duplicate candidates when resolving an action', async () => {
  document.body.innerHTML = '<button disabled>Choice</button><button>Choice</button>';
  const actualPage = page();
  const original = actualPage.locator;
  actualPage.locator = (selector: string) => selector.startsWith(':not(:disabled)') ? locator(Array.from(document.querySelectorAll('button:not(:disabled)'))) : original(selector);
  expect(await (await resolveTarget(actualPage, { text: 'Choice' }, true)).count()).toBe(1);
  await expect(resolveTarget(actualPage, { text: 'Choice' })).rejects.toMatchObject({ code: 'AMBIGUOUS_TARGET' });
});
